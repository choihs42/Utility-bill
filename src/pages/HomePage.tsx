import { Link } from 'react-router-dom';
import { useApp } from '../store/store';
import { steps } from '../domain/derive';

export function HomePage() {
  const data = useApp((s) => s.data);
  const list = steps(data);
  const next = list.find((s) => !s.done);
  return (
    <>
      <h2>시작하기</h2>
      <p className="lead">에너지 데이터를 보기 위한 기본 정보를 5단계로 정리합니다. 위에서부터 순서대로 진행하면 됩니다.</p>
      {next && (
        <div className="card next">
          다음 할 일 <b>{next.title}</b> — {next.stat} <Link to={next.to}><button>이동</button></Link>
        </div>
      )}
      <div className="steps">
        {list.map((s, i) => (
          <Link to={s.to} key={s.key} className={`step ${s.done ? 'done' : ''}`}>
            <span className="num">{s.done ? '✓' : i + 1}</span>
            <div>
              <b>{s.title}</b>
              <p>{s.desc}</p>
              <span className="dim">{s.stat}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
