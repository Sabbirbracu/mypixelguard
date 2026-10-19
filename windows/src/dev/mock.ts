// Development-only: lets the UI run in a plain browser (`pnpm dev`, then open /?mock) using REAL core output
// captured in dev-fixtures/fixtures.json. It never ships: main.tsx imports it only when import.meta.env.DEV.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function installMock() {
  // import.meta.glob (not a static import) so type-check and build still pass when the git-ignored fixtures are absent (CI).
  const load = import.meta.glob("../../dev-fixtures/fixtures.json", { import: "default" })["../../dev-fixtures/fixtures.json"];
  if (!load) throw new Error("dev-fixtures/fixtures.json is missing; the mock UI needs it");
  const fx: any = await load();
  const names = Object.keys(fx.files);
  mockWindows("main");
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const demoRegions = [
    { id: "face-1", kind: "face", rect: { x: 0.33, y: 0.2, w: 0.26, h: 0.3 }, label: "t:visual.kind.face", confidence: 0.96, isSelected: true },
    { id: "text-1", kind: "email", rect: { x: 0.08, y: 0.78, w: 0.4, h: 0.07 }, label: "sa•••@example.com", confidence: 0.91, isSelected: true },
    { id: "text-2", kind: "phone", rect: { x: 0.55, y: 0.8, w: 0.3, h: 0.06 }, label: "••••5678", confidence: 0.88, isSelected: false },
  ];

  mockIPC(async (cmd, args: any) => {
    switch (cmd) {
      case "capabilities": return { backgroundModel: true, faceModel: true, ocr: true, formats: ["jpeg", "png", "tiff", "webp"], version: "1.0.0" };
      case "built_in_recipes": return fx.recipes;
      case "list_images": return (args.paths as string[]).flatMap((p) => (p === "demo" ? names.map((n) => `C:\\Users\\demo\\Pictures\\${n}`) : [p]));
      case "scan_file": {
        await delay(250);
        const name = String(args.path).split(/[\\/]/).pop()!;
        return { ...(fx.files[name] ?? fx.files[names[0]]), created: Date.UTC(2026, 9, 12), modified: Date.UTC(2026, 9, 20) };
      }
      case "suggest_clean_name": return String(args.path).split(/[\\/]/).pop()!.replace(/(\.[^.]+)$/, "_AI-label-cleaned$1");
      case "clean_file": await delay(400); return { ...fx.clean, output: args.req.output };
      case "run_batch": {
        const inputs = args.req.inputs as string[];
        (async () => {
          for (let i = 0; i < inputs.length; i++) {
            await emit("batch-progress", { index: i, total: inputs.length, current: inputs[i].split(/[\\/]/).pop() });
            await delay(600);
            await emit("batch-result", { ...fx.batch, input_name: inputs[i].split(/[\\/]/).pop(), output: `${args.req.folder}\\${String(inputs[i]).split(/[\\/]/).pop()}` });
          }
          await emit("batch-done", false);
        })();
        return null;
      }
      case "cancel_batch": return null;
      case "convert_estimate": return 48210;
      case "compress_preview": await delay(300); return fx.compress;
      case "resize_plan": return fx.plan;
      case "preview_image": {
        const name = String(args.path).split(/[\\/]/).pop()!;
        return (fx.files[name] ?? fx.files[names[0]]).thumb;
      }
      case "ai_preview": {
        await delay(400);
        const name = String(args.path).split(/[\\/]/).pop()!;
        const f = fx.files[name] ?? fx.files[names[0]];
        const k = args.settings.upscale ? args.settings.upscaleFactor : 1;
        return { image: args.settings.removeBackground ? fx.bgCutout : f.thumb, finalWidth: f.info.width * k, finalHeight: f.info.height * k, notes: [] };
      }
      case "background_preview": await delay(700); return fx.bgCutout;
      case "redact_base": return { image: fx.faceDemo, width: 1200, height: 1200 };
      case "redact_preview": await delay(150); return fx.faceDemo;
      case "redact_scan": await delay(600); return { regions: demoRegions, recognizedTextCount: 9, textAvailable: true, facesAvailable: true };
      case "write_text_file": return null;
      case "plugin:dialog|open": return args.options?.directory ? "C:\\Users\\demo\\Pictures\\Cleaned" : ["demo"];
      case "plugin:dialog|save": return "C:\\Users\\demo\\Pictures\\out.jpg";
      case "plugin:dialog|ask": case "plugin:dialog|confirm": return true;
      default: return null;
    }
  }, { shouldMockEvents: true });
}
