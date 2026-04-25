interface Toggle {
  id: string;
  label: string;
  enabled: boolean;
  available?: boolean;
  hint?: string;
}

interface Props {
  toggles: Toggle[];
  onToggle: (id: string, value: boolean) => void;
}

export function EngineOverlay({ toggles, onToggle }: Props) {
  return (
    <div className="overlay-toggles" role="group" aria-label="Engine overlays">
      {toggles.map((t) => {
        const disabled = t.available === false;
        return (
          <button
            key={t.id}
            type="button"
            className={"overlay-chip" + (t.enabled && !disabled ? " is-on" : "")}
            onClick={() => !disabled && onToggle(t.id, !t.enabled)}
            disabled={disabled}
            title={disabled ? t.hint ?? "Not available for this game" : t.label}
          >
            <span className="overlay-chip-dot" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
