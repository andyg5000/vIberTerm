import { test as base } from '@playwright/test';
import { disableAnimations, prefetchResources } from '../helpers/performance-utils';

/**
 * Performance-optimized test fixture
 */
export const test = base.extend({
  // Override page fixture with performance optimizations
  page: async ({ page }, use) => {
    // Set up performance optimizations before each test
    await page.setViewportSize({ width: 1280, height: 720 }); // Smaller viewport

    // Disable animations
    await disableAnimations(page);

    // Set faster default timeouts
    page.setDefaultTimeout(3000);
    page.setDefaultNavigationTimeout(5000);

    // Intercept and speed up certain requests
    await page.route('**/*.png', (route) => route.abort());
    await page.route('**/*.jpg', (route) => route.abort());
    await page.route('**/*.jpeg', (route) => route.abort());
    await page.route('**/*.gif', (route) => route.abort());
    await page.route('**/*.svg', (route) => route.abort());
    await page.route('**/analytics/**', (route) => route.abort());
    await page.route('**/tracking/**', (route) => route.abort());

    // Prefetch resources on first navigation
    let firstNavigation = true;
    page.on('load', async () => {
      if (firstNavigation) {
        firstNavigation = false;
        await prefetchResources(page).catch(() => {});
      }
    });

    // Use the optimized page
    await use(page);
  },

  // Fast context with additional optimizations
  context: async ({ context }, use) => {
    // Set up context-level optimizations
    await context.addInitScript(() => {
      // Override slow APIs
      window.setTimeout = new Proxy(window.setTimeout, {
        apply: (target, thisArg, args) => {
          // Speed up timeouts in tests
          if (typeof args[1] === 'number' && args[1] > 100) {
            args[1] = Math.min(args[1], 100);
          }
          return target.apply(thisArg, args);
        },
      });

      // Mock console methods to reduce noise
      console.log = () => {};
      console.info = () => {};
      console.debug = () => {};
    });

    await use(context);
  },
});

export { expect } from '@playwright/test';
