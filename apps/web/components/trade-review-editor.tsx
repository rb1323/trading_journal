"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ReviewStatus = "unreviewed" | "draft" | "reviewed";
export type TagCategory = "setup" | "mistake" | "emotion" | "custom";

interface JournalTag {
  id: string;
  name: string;
  category: TagCategory;
  color: string;
}

interface ReviewValue {
  notes: string;
  rating: number | null;
  followedPlan: boolean | null;
  status: ReviewStatus;
  version: number;
  tagIds: string[];
}

const categoryLabels: Record<TagCategory, string> = {
  setup: "Setup",
  mistake: "Virhe",
  emotion: "Tunne",
  custom: "Muu"
};

export function TradeReviewEditor({ tradeId, initialReview, initialTags }: { tradeId: string; initialReview: ReviewValue; initialTags: JournalTag[] }) {
  const [notes, setNotes] = useState(initialReview.notes);
  const [rating, setRating] = useState<number | null>(initialReview.rating);
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(initialReview.followedPlan);
  const [status, setStatus] = useState<ReviewStatus>(initialReview.status);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialReview.tagIds);
  const [tags, setTags] = useState(initialTags);
  const [tagName, setTagName] = useState("");
  const [tagCategory, setTagCategory] = useState<TagCategory>("setup");
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const version = useRef(initialReview.version);
  const queue = useRef(Promise.resolve());
  const queuedSave = useRef(0);
  const lastSavedSnapshot = useRef(JSON.stringify({ notes: initialReview.notes, rating: initialReview.rating, followedPlan: initialReview.followedPlan, status: initialReview.status, tagIds: initialReview.tagIds }));

  const enqueueSave = useCallback((snapshot: Omit<ReviewValue, "version">) => {
    const saveId = ++queuedSave.current;
    setSaveState("saving");
    setError("");
    queue.current = queue.current.then(async () => {
      const response = await fetch(`/api/trades/${tradeId}/review`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...snapshot, version: version.current })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Tallennus epäonnistui.");
      version.current = Number(body.review.version);
      lastSavedSnapshot.current = JSON.stringify(snapshot);
      if (saveId === queuedSave.current) setSaveState("saved");
    }).catch((reason: unknown) => {
      if (saveId === queuedSave.current) {
        setSaveState("error");
        setError(reason instanceof Error ? reason.message : "Tallennus epäonnistui.");
      }
    });
  }, [tradeId]);

  useEffect(() => {
    const snapshot = { notes, rating, followedPlan, status, tagIds: selectedTags };
    if (JSON.stringify(snapshot) === lastSavedSnapshot.current) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => enqueueSave(snapshot), 900);
    return () => window.clearTimeout(timer);
  }, [notes, rating, followedPlan, status, selectedTags, enqueueSave]);

  useEffect(() => {
    const saveWithKeyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        enqueueSave({ notes, rating, followedPlan, status, tagIds: selectedTags });
      }
    };
    window.addEventListener("keydown", saveWithKeyboard);
    return () => window.removeEventListener("keydown", saveWithKeyboard);
  }, [notes, rating, followedPlan, status, selectedTags, enqueueSave]);

  const markDraft = () => status === "unreviewed" && setStatus("draft");
  const toggleTag = (tagId: string) => {
    markDraft();
    setSelectedTags((current) => current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]);
  };
  const createTag = async () => {
    if (!tagName.trim()) return;
    setError("");
    const response = await fetch("/api/journal-tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: tagName, category: tagCategory }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return setError(body.error ?? "Tagin luonti epäonnistui.");
    const tag = body.tag as JournalTag;
    setTags((current) => [...current, tag].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
    setSelectedTags((current) => [...current, tag.id]);
    setTagName("");
    markDraft();
  };

  return <section className="review-card">
    <div className="review-heading">
      <div><p className="eyebrow">JOURNAL</p><h2>Treidin jälkiarviointi</h2></div>
      <span className={`save-state ${saveState}`}>{saveState === "saved" ? "Tallennettu" : saveState === "saving" ? "Tallennetaan…" : saveState === "unsaved" ? "Tallentamatta" : "Tallennusvirhe"}</span>
    </div>
    <label className="review-notes">Muistiinpanot<textarea maxLength={20000} value={notes} onChange={(event) => { setNotes(event.target.value); markDraft(); }} placeholder="Mikä toimi, mikä ei ja mitä teen seuraavalla kerralla toisin?" /><small>{notes.length.toLocaleString("fi-FI")} / 20 000</small></label>
    <div className="review-controls">
      <label>Arvosana<select value={rating ?? ""} onChange={(event) => { setRating(event.target.value ? Number(event.target.value) : null); markDraft(); }}><option value="">Ei arvioitu</option>{[1,2,3,4,5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label>
      <label>Noudatin suunnitelmaa<select value={followedPlan === null ? "" : followedPlan ? "yes" : "no"} onChange={(event) => { setFollowedPlan(event.target.value === "" ? null : event.target.value === "yes"); markDraft(); }}><option value="">Ei arvioitu</option><option value="yes">Kyllä</option><option value="no">En</option></select></label>
      <label>Review-tila<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)}><option value="unreviewed">Arvioimatta</option><option value="draft">Luonnos</option><option value="reviewed">Arvioitu</option></select></label>
    </div>
    <div className="tag-groups">{(["setup", "mistake", "emotion", "custom"] as TagCategory[]).map((category) => <div className="tag-group" key={category}><strong>{categoryLabels[category]}</strong><div>{tags.filter((tag) => tag.category === category).map((tag) => <button type="button" key={tag.id} className={`tag-pill ${selectedTags.includes(tag.id) ? "selected" : ""}`} style={{ "--tag-color": tag.color } as React.CSSProperties} onClick={() => toggleTag(tag.id)}>{tag.name}</button>)}</div></div>)}</div>
    <div className="tag-create"><input value={tagName} maxLength={40} onChange={(event) => setTagName(event.target.value)} placeholder="Uusi tagi" /><select value={tagCategory} onChange={(event) => setTagCategory(event.target.value as TagCategory)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="ghost" onClick={createTag}>Lisää tagi</button></div>
    <div className="review-actions"><button type="button" className="primary" onClick={() => setStatus("reviewed")}>Merkitse arvioiduksi</button><button type="button" className="ghost" onClick={() => enqueueSave({ notes, rating, followedPlan, status, tagIds: selectedTags })}>Tallenna nyt</button></div>
    {error && <p className="error">{error}</p>}
  </section>;
}
