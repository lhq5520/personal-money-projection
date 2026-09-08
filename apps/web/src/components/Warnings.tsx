export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="warnings" role="status" aria-live="polite">
      {items.map((w) => (
        <div className="warn" key={w}>
          {/* 图标 + 文字，不靠颜色单独传达状态 */}
          <span className="icon" aria-hidden="true">⚠</span>
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}
