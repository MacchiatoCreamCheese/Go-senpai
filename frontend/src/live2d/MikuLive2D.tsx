import { useEffect, useRef, useState } from "react";
import { Live2DModel, PIXI } from "./live2dInit";

const MODEL_JSON = "/live2d/21miku_normal_3.0_f_t02/21miku_normal_3.0_f_t02.model3.json";
const IDLE_MOTION = "motions/w-normal-yurayura01.motion3.json";

function disableDisplayEvents(obj: { eventMode?: string; children?: unknown[] } | null | undefined): void {
  if (!obj || typeof obj !== "object") return;
  if ("eventMode" in obj) obj.eventMode = "none";
  const ch = obj.children;
  if (Array.isArray(ch)) {
    for (const c of ch) disableDisplayEvents(c as { eventMode?: string; children?: unknown[] });
  }
}

// Live2D model is compatible at runtime but not in Pixi typings.
function disableLive2dSubtree(model: InstanceType<typeof Live2DModel>): void {
  disableDisplayEvents(model as unknown as { eventMode?: string; children?: unknown[] });
}

export function MikuLive2D({ speaking = false }: { speaking?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const speakingRef = useRef(speaking);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let mounted = true;
    let resizeCleanup: (() => void) | undefined;
    let app: InstanceType<typeof PIXI.Application> | null = null;
    const modelRef: { current: InstanceType<typeof Live2DModel> | null } = { current: null };

    let idleRaf: number | null = null;
    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    let isBlinking = false;
    let blinkStartTime = 0;

    const stopIdle = () => {
      if (idleRaf !== null) {
        cancelAnimationFrame(idleRaf);
        idleRaf = null;
      }
      if (blinkTimer !== null) {
        clearTimeout(blinkTimer);
        blinkTimer = null;
      }
    };

    const startIdleAnimation = () => {
      const scheduleBlink = () => {
        const delay = 3000 + Math.random() * 3000;
        blinkTimer = setTimeout(() => {
          if (!mounted) return;
          isBlinking = true;
          blinkStartTime = performance.now();
          scheduleBlink();
        }, delay);
      };
      scheduleBlink();

      const animateIdle = () => {
        if (!mounted || !modelRef.current?.internalModel?.coreModel) {
          idleRaf = null;
          return;
        }

        try {
          const core = modelRef.current.internalModel.coreModel as {
            parameters?: { ids: string[]; values: number[] };
            _model?: { parameters: { ids: string[]; values: number[] } };
          };
          const params = core.parameters ?? core._model?.parameters;
          if (!params?.ids || !params.values) {
            idleRaf = null;
            return;
          }

          const time = performance.now() * 0.001;
          const blinkDuration = 250;
          let eyeOpenValue = 1;

          if (isBlinking) {
            const blinkElapsed = performance.now() - blinkStartTime;
            if (blinkElapsed < 100) eyeOpenValue = 1 - blinkElapsed / 100;
            else if (blinkElapsed < 150) eyeOpenValue = 0;
            else if (blinkElapsed < blinkDuration) eyeOpenValue = (blinkElapsed - 150) / 100;
            else {
              isBlinking = false;
              eyeOpenValue = 1;
            }
          }

          const eyeOpenParams = ["ParamEyeLOpen", "ParamEyeROpen", "PARAM_EYE_L_OPEN", "PARAM_EYE_R_OPEN", "ParamEyeOpen"];
          for (const name of eyeOpenParams) {
            const idx = params.ids.indexOf(name);
            if (idx !== -1) params.values[idx] = eyeOpenValue;
          }

          const swayValue = Math.sin(time * 0.3) * 2;
          const bodyXParams = ["ParamBodyAngleX", "PARAM_BODY_ANGLE_X", "ParamBodyX"];
          for (const name of bodyXParams) {
            const idx = params.ids.indexOf(name);
            if (idx !== -1 && Math.abs(params.values[idx]) < 5) {
              params.values[idx] = swayValue;
              break;
            }
          }

          const clothSwayX = Math.sin(time * 0.4) * 0.1;
          const clothSwayY = Math.sin(time * 0.6) * 0.05;
          const clothXParams = ["ParamCloth1", "PARAM_CLOTH_1", "ParamPhysics1", "ParamClothX"];
          const clothYParams = ["ParamCloth2", "PARAM_CLOTH_2", "ParamPhysics2", "ParamClothY"];
          for (const name of clothXParams) {
            const idx = params.ids.indexOf(name);
            if (idx !== -1 && Math.abs(params.values[idx]) < 0.2) {
              params.values[idx] = clothSwayX;
              break;
            }
          }
          for (const name of clothYParams) {
            const idx = params.ids.indexOf(name);
            if (idx !== -1 && Math.abs(params.values[idx]) < 0.1) {
              params.values[idx] = clothSwayY;
              break;
            }
          }

          const breathValue = Math.sin(time * 1.5) * 0.15 + 0.1;
          for (const name of ["ParamBreath", "PARAM_BREATH"]) {
            const idx = params.ids.indexOf(name);
            if (idx !== -1) {
              params.values[idx] = breathValue;
              break;
            }
          }

          const mouthValue = speakingRef.current ? Math.abs(Math.sin(time * 8)) * 0.8 : 0;
          for (const name of ["ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y", "ParamMouthOpen"]) {
            const idx = params.ids.indexOf(name);
            if (idx !== -1) {
              params.values[idx] = mouthValue;
              break;
            }
          }

          idleRaf = requestAnimationFrame(animateIdle);
        } catch {
          idleRaf = null;
        }
      };

      idleRaf = requestAnimationFrame(animateIdle);
    };

    const init = async () => {
      try {
        let attempts = 0;
        while (typeof window.Live2DCubismCore === "undefined" && attempts < 50) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
        if (typeof window.Live2DCubismCore === "undefined") {
          throw new Error("Live2DCubismCore not loaded. Refresh the page.");
        }

        if (!mounted) return;

        Live2DModel.registerTicker(PIXI.Ticker as never);

        const width = Math.max(1, el.clientWidth);
        const height = Math.max(1, el.clientHeight);

        app = new PIXI.Application({
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          width,
          height,
        });

        if (app.renderer && "events" in app.renderer && app.renderer.events) {
          (app.renderer.events as { autoPreventDefault?: boolean }).autoPreventDefault = false;
        }

        if (!mounted) {
          app.destroy(true, { children: true });
          app = null;
          return;
        }

        const canvas = app.view;
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error("PIXI view is not a canvas");
        }
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
        el.appendChild(canvas);

        const model = await Live2DModel.from(MODEL_JSON, { autoInteract: false });

        if (!mounted) return;
        modelRef.current = model;

        model.scale.set(0.15);
        model.anchor.set(0.5, 0.5);
        model.x = app.screen.width / 2;
        model.y = app.screen.height / 2 + 20;

        model.eventMode = "none";
        (model as { interactiveChildren?: boolean }).interactiveChildren = false;
        if (typeof (model as { isInteractive?: () => boolean }).isInteractive !== "function") {
          (model as { isInteractive: () => boolean }).isInteractive = () => false;
        }

        app.stage.eventMode = "none";
        app.stage.addChild(model as unknown as PIXI.DisplayObject);
        disableLive2dSubtree(model);

        try {
          await model.motion(IDLE_MOTION);
        } catch {
          /* motion optional */
        }

        startIdleAnimation();
        setStatus("ready");
        setErrorMsg(null);

        const handleResize = () => {
          if (!mounted || !app || !modelRef.current || !containerRef.current) return;
          const w = Math.max(1, containerRef.current.clientWidth);
          const h = Math.max(1, containerRef.current.clientHeight);
          app.renderer.resize(w, h);
          modelRef.current.x = w / 2;
          modelRef.current.y = h / 2 + 20;
        };

        window.addEventListener("resize", handleResize);
        handleResize();
        resizeCleanup = () => window.removeEventListener("resize", handleResize);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (mounted) {
          setStatus("error");
          setErrorMsg(msg);
        }
      }
    };

    void init();

    return () => {
      mounted = false;
      resizeCleanup?.();
      stopIdle();
      modelRef.current = null;
      if (app) {
        try {
          app.destroy(true, { children: true });
        } catch {
          /* ignore */
        }
        app = null;
      }
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
        }}
        aria-hidden
      />
      {status !== "ready" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: 12,
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 11,
            color: "var(--ink-mute, #666)",
            pointerEvents: "none",
          }}
        >
          {status === "loading" ? "loading miku…" : errorMsg ?? "live2d error"}
        </div>
      ) : null}
    </div>
  );
}
