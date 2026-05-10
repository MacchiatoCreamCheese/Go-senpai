/**
 * Live2D initialization — must be imported before Live2DModel usage.
 * Cubism 4 models require `pixi-live2d-display/cubism4` + global Live2DCubismCore script.
 */
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";

declare global {
  interface Window {
    PIXI: typeof PIXI;
    Live2DCubismCore?: unknown;
  }
}

if (typeof window !== "undefined") {
  window.PIXI = PIXI;
}

Live2DModel.registerTicker(PIXI.Ticker as never);

if (Live2DModel.prototype) {
  const noop = () => {};
  Live2DModel.prototype.registerInteraction = noop;
  Live2DModel.prototype.unregisterInteraction = noop;
  Live2DModel.prototype.isInteractive = () => false;
}

if (typeof window !== "undefined") {
  const EventBoundaryClass = (PIXI as unknown as { EventBoundary?: { prototype?: { hitTestMoveRecursive?: (...a: unknown[]) => unknown } } }).EventBoundary;
  if (EventBoundaryClass?.prototype?.hitTestMoveRecursive) {
    const proto = EventBoundaryClass.prototype;
    const originalHitTestMoveRecursive = proto.hitTestMoveRecursive;
    proto.hitTestMoveRecursive = function (currentTarget: unknown, location: unknown, testFn: unknown, result: unknown) {
      try {
        if (
          currentTarget &&
          typeof (currentTarget as { isInteractive?: unknown }).isInteractive !== "function" &&
          (currentTarget as { eventMode?: string }).eventMode !== undefined
        ) {
          try {
            Object.defineProperty(currentTarget, "isInteractive", {
              get(this: { eventMode?: string }) {
                return this.eventMode !== undefined && this.eventMode !== "none";
              },
              configurable: true,
              enumerable: false,
            });
          } catch {
            return result;
          }
        }
        return originalHitTestMoveRecursive!.call(this, currentTarget, location, testFn, result);
      } catch {
        return result;
      }
    };
  }
}

export { PIXI, Live2DModel };
