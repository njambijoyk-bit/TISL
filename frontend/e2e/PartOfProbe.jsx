import PartOfWork from '/src/_shared/components/common/PartOfWork.jsx';

/** The "Part of" strip on its own, as a support ticket's page shows it (build 7.4). */
export default function PartOfProbe() {
  return <div><h1 style={{ fontSize: 20 }}>TK-0031 · Leaking roof in room 4</h1><PartOfWork type="support.ticket" id={3} /></div>;
}
