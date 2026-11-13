export function Msg({ text, note }: { text: string | null; note?: string | null }) {
  if (text) return <div className="msg">{text}</div>;
  if (note) return <div className="msg okmsg">{note}</div>;
  return null;
}
