export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'danger',
}) {
  const confirmClassName = tone === 'danger'
    ? 'bg-red-500/20 border border-red-500/30 text-accent-red'
    : 'bg-accent text-white border border-accent'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6 animate-fade-in">
      <div className="bg-surface rounded-2xl p-5 w-full max-w-sm border border-surface2 shadow-2xl">
        <h3 className="font-display font-bold text-text-primary text-lg mb-2">{title}</h3>
        <p className="text-text-secondary text-sm mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm active:scale-95 transition-transform ${confirmClassName}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
