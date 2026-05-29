import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "@/lib/theme-context";
import { Palette, Moon, Sun } from "lucide-react";

const PRESETS = [
  { name: "Indigo", hue: 250 },
  { name: "Bleu", hue: 230 },
  { name: "Teal", hue: 190 },
  { name: "Vert", hue: 150 },
  { name: "Ambre", hue: 70 },
  { name: "Orange", hue: 40 },
  { name: "Rouge", hue: 20 },
  { name: "Rose", hue: 350 },
  { name: "Violet", hue: 300 },
];

export function ThemeSettings() {
  const { mode, hue, setMode, setHue, toggleMode } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-[var(--sidebar-accent)] transition-colors"
          title="Apparence"
        >
          <Palette className="w-4 h-4" /> Apparence
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(18rem,calc(100vw-1.5rem))] max-h-[80vh] overflow-y-auto"
      >
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Thème
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mode === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("light")}
              >
                <Sun className="w-4 h-4 mr-1.5" /> Clair
              </Button>
              <Button
                variant={mode === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("dark")}
              >
                <Moon className="w-4 h-4 mr-1.5" /> Sombre
              </Button>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Couleur d'accent
            </div>
            <div className="grid grid-cols-9 gap-1.5 mb-3">
              {PRESETS.map((p) => (
                <button
                  key={p.hue}
                  title={p.name}
                  onClick={() => setHue(p.hue)}
                  className="aspect-square rounded-md border-2 transition-transform hover:scale-110"
                  style={{
                    background: `oklch(0.55 0.18 ${p.hue})`,
                    borderColor: hue === p.hue ? "var(--foreground)" : "transparent",
                  }}
                />
              ))}
            </div>
            <Slider
              value={[hue]}
              min={0}
              max={360}
              step={1}
              onValueChange={(v) => setHue(v[0])}
            />
            <div className="text-xs text-muted-foreground mt-1 text-right">Hue: {hue}°</div>
          </div>

          <Button variant="ghost" size="sm" onClick={toggleMode} className="w-full">
            Basculer thème
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
