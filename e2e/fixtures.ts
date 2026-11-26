import { test as baseTest, expect, Page, TestInfo } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

type CustomFixtures = {
  autoCoverage: void;
};

export const test = baseTest.extend<CustomFixtures>({
  autoCoverage: [
    async ({ page }: { page: Page }, use: () => Promise<void>, testInfo: TestInfo) => {
      const isChromium = testInfo.project.name === 'chromium';

      if (isChromium) {
        await Promise.all([
          page.coverage.startJSCoverage({
            resetOnNavigation: false,
          }),
          page.coverage.startCSSCoverage({
            resetOnNavigation: false,
          }),
        ]);
      }

      await use();

      if (isChromium) {
        const [jsCoverage, cssCoverage] = await Promise.all([
          page.coverage.stopJSCoverage(),
          page.coverage.stopCSSCoverage(),
        ]);

        const coverageList = [...jsCoverage, ...cssCoverage];
        await addCoverageReport(coverageList, testInfo);
      }
    },
    { scope: 'test', auto: true },
  ],
});

export { expect };
