export function Msg({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="msg">{text}</div>;
}
