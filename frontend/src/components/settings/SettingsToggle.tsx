interface SettingsToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function SettingsToggle({ checked, onChange, disabled }: SettingsToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        width: 51,
        height: 31,
        backgroundColor: checked ? 'var(--accent)' : 'var(--bg-tertiary)',
      }}
    >
      <span
        className="pointer-events-none inline-block rounded-full bg-white shadow transition-transform duration-200 ease-in-out"
        style={{
          width: 27,
          height: 27,
          marginTop: 2,
          marginLeft: checked ? 22 : 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  )
}
