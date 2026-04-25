interface Props {
  title: string;
  blurb?: string;
  mark?: string;
}

export default function Stub({ title, blurb, mark = "未" }: Props) {
  return (
    <div className="stub-page">
      <div className="stub-mark" aria-hidden="true">{mark}</div>
      <h1>{title}</h1>
      <p>{blurb ?? "Coming together in a later sub-phase. The plumbing is in place."}</p>
    </div>
  );
}
