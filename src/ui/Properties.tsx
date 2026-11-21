import type { ReactNode } from "react";
import { getDiagramType } from "../catalog";
import { diagramTypeName, elementName, t, useLanguage } from "../i18n";
import { newMemberId } from "../model/factory";
import { EXTRA_FIELDS, FRAGMENT_OPERATORS, MESSAGE_TYPES } from "../model/fields";
import { CLASSIFIER_TYPES, getElementDef } from "../model/registry";
import type { AggregationKind, ErdAttribute, LineStyle, LinkView, ModelElement, Navigability, RoleEnd, UmlOperation, UmlParameter, Visibility } from "../model/types";
import { activeDiagram, useEditor } from "../store/store";

const VISIBILITIES: Visibility[] = ["public", "private", "protected", "package"];
const VIS_SYMBOL: Record<Visibility, string> = { public: "+", private: "-", protected: "#", package: "~" };
const LINE_STYLES: LineStyle[] = ["oblique", "rectangular", "rounded-rectangular", "smooth", "straight"];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />;
}

function parseParams(s: string): UmlParameter[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [left, def] = x.split("=").map((y) => y.trim());
      const [namePart, type] = left.split(":").map((y) => y.trim());
      const words = namePart.split(/\s+/);
      const direction = ["in", "out", "inout"].includes(words[0]) && words.length > 1 ? (words.shift() as UmlParameter["direction"]) : undefined;
      return { name: words.join(" "), type: type ?? "", direction, defaultValue: def || undefined };
    });
}

const formatParams = (ps: UmlParameter[]) =>
  ps.map((p) => `${p.direction && p.direction !== "in" ? p.direction + " " : ""}${p.name}${p.type ? ": " + p.type : ""}${p.defaultValue ? " = " + p.defaultValue : ""}`).join(", ");

export function Properties() {
  useLanguage();
  const project = useEditor((s) => s.project);
  const diagram = useEditor(activeDiagram);
  const selection = useEditor((s) => s.selection);
  const updateElement = useEditor((s) => s.updateElement);
  const updateView = useEditor((s) => s.updateView);
  const renameDiagram = useEditor((s) => s.renameDiagram);

  if (!diagram) return <aside className="props" />;
  if (selection.length !== 1) {
    const typeDef = getDiagramType(diagram.type);
    return (
      <aside className="props">
        <div className="panel-title">{t("props.diagram")}</div>
        <Field label={t("props.name")}>
          <Text value={diagram.name} onChange={(v) => renameDiagram(diagram.id, v)} />
        </Field>
        <Field label={t("props.type")}>
          <input value={diagramTypeName(diagram.type, typeDef?.name)} readOnly />
        </Field>
        <p className="hint">{selection.length > 1 ? t("props.multi", { n: selection.length }) : t("props.hint")}</p>
      </aside>
    );
  }

  const view = diagram.views.find((v) => v.iid === selection[0]);
  const el = view ? project.elements[view.ref] : undefined;
  if (!view || !el) return <aside className="props" />;
  const set = (patch: Partial<ModelElement>) => updateElement(el.id, patch);
  const setProp = (key: string, value: string) => set({ props: { ...el.props, [key]: value } });
  const isEdge = getElementDef(el.type).category === "edge";

  return (
    <aside className="props">
      <div className="panel-title">
        {elementName(el.type)} <span className="cid">{el.cid}</span>
      </div>
      {el.type !== "comment" && el.type !== "sequence-action" && (
        <Field label={t("props.name")}>
          <Text value={el.name} onChange={(v) => set({ name: v })} />
        </Field>
      )}
      {el.type === "comment" && (
        <Field label={t("props.text")}>
          <textarea rows={5} value={el.props?.text ?? ""} onChange={(e) => setProp("text", e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        </Field>
      )}
      {!["comment", "text", "initial-node", "initial-state", "final-state", "activity-final-node"].includes(el.type) && (
        <Field label={t("props.stereotypes")}>
          <Text value={(el.stereotypes ?? []).join(", ")} placeholder="entity, control" onChange={(v) => set({ stereotypes: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </Field>
      )}
      {CLASSIFIER_TYPES.has(el.type) && el.type !== "enumeration" && (
        <label className="check">
          <input type="checkbox" checked={!!el.isAbstract} onChange={(e) => set({ isAbstract: e.target.checked })} /> {t("props.abstract")}
        </label>
      )}

      {CLASSIFIER_TYPES.has(el.type) && el.type !== "enumeration" && el.type !== "uml-interface-classifier" && <AttributesEditor el={el} set={set} />}
      {el.type === "uml-interface-classifier" && el.attributes && el.attributes.length > 0 && <AttributesEditor el={el} set={set} />}
      {CLASSIFIER_TYPES.has(el.type) && <OperationsEditor el={el} set={set} />}
      {el.type === "enumeration" && <LiteralsEditor el={el} set={set} />}
      {el.type === "object" && <ObjectEditor el={el} set={set} />}
      {(el.type === "erd-entity" || el.type === "idef1x-entity") && <ErdEditor el={el} set={set} />}
      {el.type === "relationship" && <RolesEditor el={el} set={set} />}
      {el.type === "erd-relationship" && el.erd && (
        <>
          <Field label={t("props.erdKind")}>
            <select value={el.erd.kind} onChange={(e) => set({ erd: { ...el.erd!, kind: e.target.value as "Identifying" } })}>
              <option value="Identifying">{t("props.identifying")}</option>
              <option value="NonIdentifying">{t("props.nonIdentifying")}</option>
            </select>
          </Field>
          <Field label={t("props.multFrom")}>
            <Multiplicity value={el.erd.multiplicityFrom} onChange={(v) => set({ erd: { ...el.erd!, multiplicityFrom: v } })} />
          </Field>
          <Field label={t("props.multTo")}>
            <Multiplicity value={el.erd.multiplicityTo} onChange={(v) => set({ erd: { ...el.erd!, multiplicityTo: v } })} />
          </Field>
        </>
      )}
      {["general-transition", "transition", "control-flow", "object-flow"].includes(el.type) && (
        <>
          <Field label={t("props.guard")}>
            <Text value={el.guard ?? ""} onChange={(v) => set({ guard: v })} />
          </Field>
          <Field label={t("props.effect")}>
            <Text value={el.props?.effect ?? ""} onChange={(v) => setProp("effect", v)} />
          </Field>
        </>
      )}
      {el.type === "sequence-action" && (
        <>
          <Field label={t("props.message")}>
            <Text value={el.props?.message ?? ""} onChange={(v) => setProp("message", v)} />
          </Field>
          <Field label={t("props.messageType")}>
            <select value={el.props?.messageType ?? "call"} onChange={(e) => setProp("messageType", e.target.value)}>
              {MESSAGE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t("message." + k)}
                </option>
              ))}
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={el.props?.async === "true"} onChange={(e) => setProp("async", String(e.target.checked))} /> {t("props.async")}
          </label>
          <Field label={t("props.returnValue")}>
            <Text value={el.props?.returnValue ?? ""} onChange={(v) => setProp("returnValue", v)} />
          </Field>
        </>
      )}
      {(el.type === "lifeline" || el.type === "object") && (
        <Field label={t("props.classifier")}>
          <select
            value={el.props?.classifierRef ?? ""}
            onChange={(e) => {
              const c = project.elements[e.target.value];
              set({ props: { ...el.props, classifierRef: e.target.value, classifierName: c?.name ?? "" } });
            }}
          >
            <option value="">{t("props.none")}</option>
            {Object.values(project.elements)
              .filter((c) => CLASSIFIER_TYPES.has(c.type) || c.type === "actor" || c.type === "component")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      {(el.type === "fragment" || el.type === "interaction-operand") && (
        <>
          {el.type === "fragment" && (
            <Field label={t("props.operator")}>
              <select value={el.props?.operator ?? "alt"} onChange={(e) => setProp("operator", e.target.value)}>
                {FRAGMENT_OPERATORS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t("props.guard")}>
            <Text value={el.guard ?? ""} onChange={(v) => set({ guard: v })} />
          </Field>
        </>
      )}
      {el.type === "history" && (
        <label className="check">
          <input type="checkbox" checked={el.props?.deep === "true"} onChange={(e) => setProp("deep", String(e.target.checked))} /> {t("props.deepHistory")}
        </label>
      )}
      {el.type === "erd-chen-attribute" && (
        <label className="check">
          <input type="checkbox" checked={el.props?.key === "true"} onChange={(e) => setProp("key", String(e.target.checked))} /> {t("props.keyAttribute")}
        </label>
      )}
      {el.type === "erd-chen-entity" && (
        <label className="check">
          <input type="checkbox" checked={el.props?.weak === "true"} onChange={(e) => setProp("weak", String(e.target.checked))} /> {t("props.weakEntity")}
        </label>
      )}
      {(EXTRA_FIELDS[el.type] ?? []).map((f) =>
        f.kind === "check" ? (
          <label key={f.key} className="check">
            <input
              type="checkbox"
              checked={el.props?.[f.key] === "true" || (f.key === "collapsed" && el.props?.[f.key] === undefined)}
              onChange={(e) => setProp(f.key, String(e.target.checked))}
            />{" "}
            {t(f.label)}
          </label>
        ) : (
          <Field key={f.key} label={t(f.label)}>
            {f.kind === "select" ? (
              <select value={el.props?.[f.key] ?? f.options![0]} onChange={(e) => setProp(f.key, e.target.value)}>
                {f.options!.map((o) => (
                  <option key={o} value={o}>
                    {o ? t("opt." + o) : t("props.none")}
                  </option>
                ))}
              </select>
            ) : f.kind === "textarea" ? (
              <textarea rows={4} value={el.props?.[f.key] ?? ""} onChange={(e) => setProp(f.key, e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            ) : (
              <Text value={el.props?.[f.key] ?? ""} onChange={(v) => setProp(f.key, v)} />
            )}
          </Field>
        ),
      )}
      {isEdge && view.kind === "relation" && view.itemType !== "sequence-action" && (
        <>
          <Field label={t("props.lineStyle")}>
            <select value={view.lineStyle} onChange={(e) => updateView(view.iid, { lineStyle: e.target.value as LineStyle, points: [], startAnchor: undefined, endAnchor: undefined })}>
              {LINE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {t("line." + s)}
                </option>
              ))}
            </select>
          </Field>
          <div className="row-buttons">
            <button onClick={() => updateView(view.iid, { points: [], startAnchor: undefined, endAnchor: undefined })}>{t("props.resetPath")}</button>
            <button
              onClick={() => {
                const v = view as LinkView;
                updateView(v.iid, { fromIid: v.toIid, toIid: v.fromIid, fromField: v.toField, toField: v.fromField, points: [...v.points].reverse(), startAnchor: v.endAnchor, endAnchor: v.startAnchor, layoutExtra: undefined });
                set({ from: el.to, to: el.from, start: el.end, end: el.start, erd: el.erd && { ...el.erd, multiplicityFrom: el.erd.multiplicityTo, multiplicityTo: el.erd.multiplicityFrom } });
              }}
            >
              {t("props.swapEnds")}
            </button>
          </div>
        </>
      )}
      <Field label={t("props.documentation")}>
        <textarea rows={4} value={el.documentation ?? ""} onChange={(e) => set({ documentation: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      </Field>
    </aside>
  );
}

type EditorProps = { el: ModelElement; set: (patch: Partial<ModelElement>) => void };

function VisSelect({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <select className="vis" value={value} onChange={(e) => onChange(e.target.value as Visibility)} title={t("props.visibility")}>
      {VISIBILITIES.map((v) => (
        <option key={v} value={v}>
          {VIS_SYMBOL[v]}
        </option>
      ))}
    </select>
  );
}

function ListHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="list-header">
      <span>{title}</span>
      <button className="small" onClick={onAdd}>
        + {t("props.add")}
      </button>
    </div>
  );
}

function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

function RowTools({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete: () => void }) {
  return (
    <span className="row-tools">
      <button onClick={onUp} title={t("props.up")}>↑</button>
      <button onClick={onDown} title={t("props.down")}>↓</button>
      <button onClick={onDelete} title={t("props.remove")}>×</button>
    </span>
  );
}

function AttributesEditor({ el, set }: EditorProps) {
  const list = el.attributes ?? [];
  const upd = (i: number, patch: Partial<(typeof list)[number]>) => set({ attributes: list.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <div className="list">
      <ListHeader title={t("props.attributes")} onAdd={() => set({ attributes: [...list, { id: newMemberId(), name: `attribute${list.length + 1}`, type: "String", visibility: "private" }] })} />
      {list.map((a, i) => (
        <div key={a.id} className="list-row">
          <VisSelect value={a.visibility} onChange={(v) => upd(i, { visibility: v })} />
          <Text value={a.name} onChange={(v) => upd(i, { name: v })} placeholder={t("props.name")} />
          <Text value={a.type} onChange={(v) => upd(i, { type: v })} placeholder={t("props.type")} />
          <label className="mini-check" title={t("props.static")}>
            <input type="checkbox" checked={!!a.isStatic} onChange={(e) => upd(i, { isStatic: e.target.checked || undefined })} />S
          </label>
          <RowTools onUp={() => set({ attributes: move(list, i, -1) })} onDown={() => set({ attributes: move(list, i, 1) })} onDelete={() => set({ attributes: list.filter((_, j) => j !== i) })} />
        </div>
      ))}
    </div>
  );
}

function OperationsEditor({ el, set }: EditorProps) {
  const list = el.operations ?? [];
  const upd = (i: number, patch: Partial<UmlOperation>) => set({ operations: list.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  return (
    <div className="list">
      <ListHeader title={t("props.operations")} onAdd={() => set({ operations: [...list, { id: newMemberId(), name: `operation${list.length + 1}`, returnType: "", visibility: "public", parameters: [] }] })} />
      {list.map((o, i) => (
        <div key={o.id} className="list-row wrap">
          <VisSelect value={o.visibility} onChange={(v) => upd(i, { visibility: v })} />
          <Text value={o.name} onChange={(v) => upd(i, { name: v })} placeholder={t("props.name")} />
          <Text value={o.returnType} onChange={(v) => upd(i, { returnType: v })} placeholder={t("props.returnType")} />
          <RowTools onUp={() => set({ operations: move(list, i, -1) })} onDown={() => set({ operations: move(list, i, 1) })} onDelete={() => set({ operations: list.filter((_, j) => j !== i) })} />
          <ParamsInput value={o.parameters} onChange={(parameters) => upd(i, { parameters })} />
          <label className="mini-check">
            <input type="checkbox" checked={!!o.isStatic} onChange={(e) => upd(i, { isStatic: e.target.checked || undefined })} />
            {t("props.static")}
          </label>
          <label className="mini-check">
            <input type="checkbox" checked={!!o.isAbstract} onChange={(e) => upd(i, { isAbstract: e.target.checked || undefined })} />
            {t("props.abstract")}
          </label>
        </div>
      ))}
    </div>
  );
}

function ParamsInput({ value, onChange }: { value: UmlParameter[]; onChange: (v: UmlParameter[]) => void }) {
  return (
    <input
      className="params"
      key={formatParams(value)}
      defaultValue={formatParams(value)}
      placeholder={t("props.parameters")}
      onBlur={(e) => onChange(parseParams(e.target.value))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function LiteralsEditor({ el, set }: EditorProps) {
  const list = el.literals ?? [];
  return (
    <div className="list">
      <ListHeader title={t("props.literals")} onAdd={() => set({ literals: [...list, { id: newMemberId(), name: `LITERAL${list.length + 1}` }] })} />
      {list.map((l, i) => (
        <div key={l.id} className="list-row">
          <Text value={l.name} onChange={(v) => set({ literals: list.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
          <RowTools onUp={() => set({ literals: move(list, i, -1) })} onDown={() => set({ literals: move(list, i, 1) })} onDelete={() => set({ literals: list.filter((_, j) => j !== i) })} />
        </div>
      ))}
    </div>
  );
}

function ObjectEditor({ el, set }: EditorProps) {
  const list = el.attributes ?? [];
  return (
    <div className="list">
      <ListHeader title={t("props.slots")} onAdd={() => set({ attributes: [...list, { id: newMemberId(), name: `attribute${list.length + 1}`, type: "", visibility: "public", defaultValue: "" }] })} />
      {list.map((a, i) => (
        <div key={a.id} className="list-row">
          <Text value={a.name} onChange={(v) => set({ attributes: list.map((x, j) => (j === i ? { ...x, name: v } : x)) })} placeholder={t("props.name")} />
          <Text value={a.defaultValue ?? ""} onChange={(v) => set({ attributes: list.map((x, j) => (j === i ? { ...x, defaultValue: v } : x)) })} placeholder={t("props.value")} />
          <RowTools onUp={() => set({ attributes: move(list, i, -1) })} onDown={() => set({ attributes: move(list, i, 1) })} onDelete={() => set({ attributes: list.filter((_, j) => j !== i) })} />
        </div>
      ))}
    </div>
  );
}

function ErdEditor({ el, set }: EditorProps) {
  const list = el.erdAttributes ?? [];
  const upd = (i: number, patch: Partial<ErdAttribute>) => set({ erdAttributes: list.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const add = () =>
    set({
      erdAttributes: [
        ...list,
        { id: newMemberId(), name: list.length ? `Column${list.length + 1}` : "ID", type: list.length ? "varchar" : "int", size: list.length ? "50" : "", primaryKey: !list.length, foreignKey: false, nullable: !!list.length, autoIncrement: false, defaultValue: "", description: "" },
      ],
    });
  return (
    <div className="list">
      <ListHeader title={t("props.columns")} onAdd={add} />
      {list.map((a, i) => (
        <div key={a.id} className="list-row wrap">
          <Text value={a.name} onChange={(v) => upd(i, { name: v })} placeholder={t("props.name")} />
          <Text value={a.type} onChange={(v) => upd(i, { type: v })} placeholder={t("props.type")} />
          <input className="size" value={a.size} onChange={(e) => upd(i, { size: e.target.value })} placeholder={t("props.size")} onKeyDown={(e) => e.stopPropagation()} />
          <RowTools onUp={() => set({ erdAttributes: move(list, i, -1) })} onDown={() => set({ erdAttributes: move(list, i, 1) })} onDelete={() => set({ erdAttributes: list.filter((_, j) => j !== i) })} />
          <label className="mini-check">
            <input type="checkbox" checked={a.primaryKey} onChange={(e) => upd(i, { primaryKey: e.target.checked, nullable: e.target.checked ? false : a.nullable })} />
            PK
          </label>
          <label className="mini-check">
            <input type="checkbox" checked={a.foreignKey} onChange={(e) => upd(i, { foreignKey: e.target.checked })} />
            FK
          </label>
          <label className="mini-check">
            <input type="checkbox" checked={a.nullable} onChange={(e) => upd(i, { nullable: e.target.checked })} />
            NULL
          </label>
          <label className="mini-check">
            <input type="checkbox" checked={!!a.unique} onChange={(e) => upd(i, { unique: e.target.checked || undefined })} />
            UQ
          </label>
          <label className="mini-check">
            <input type="checkbox" checked={a.autoIncrement} onChange={(e) => upd(i, { autoIncrement: e.target.checked })} />
            AI
          </label>
        </div>
      ))}
    </div>
  );
}

function Multiplicity({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input list="multiplicities" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <datalist id="multiplicities">
        {["", "0..1", "1", "0..*", "1..*", "*"].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  );
}

function RolesEditor({ el, set }: EditorProps) {
  const role = (key: "start" | "end", r: RoleEnd | undefined) => {
    const cur = r ?? { name: "", multiplicity: "", navigability: "" as Navigability, aggregation: "association" as AggregationKind };
    const upd = (patch: Partial<RoleEnd>) => set({ [key]: { ...cur, ...patch } });
    return (
      <fieldset className="role">
        <legend>{key === "start" ? t("props.startRole") : t("props.endRole")}</legend>
        <Field label={t("props.roleName")}>
          <Text value={cur.name} onChange={(v) => upd({ name: v })} />
        </Field>
        <Field label={t("props.multiplicity")}>
          <Multiplicity value={cur.multiplicity} onChange={(v) => upd({ multiplicity: v })} />
        </Field>
        <Field label={t("props.aggregation")}>
          <select value={cur.aggregation} onChange={(e) => upd({ aggregation: e.target.value as AggregationKind })}>
            <option value="association">{t("agg.none")}</option>
            <option value="aggregation">{t("agg.aggregation")}</option>
            <option value="composition">{t("agg.composition")}</option>
          </select>
        </Field>
        <Field label={t("props.navigability")}>
          <select value={cur.navigability} onChange={(e) => upd({ navigability: e.target.value as Navigability })}>
            <option value="">{t("nav.unspecified")}</option>
            <option value="navigable">{t("nav.navigable")}</option>
            <option value="non-navigable">{t("nav.nonNavigable")}</option>
          </select>
        </Field>
      </fieldset>
    );
  };
  return (
    <>
      {role("start", el.start)}
      {role("end", el.end)}
    </>
  );
}
