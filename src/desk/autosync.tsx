import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { applyRemote, fetchRemote, localBundle, pushLocal, type Remote } from "@/desk/sync";
import { getDesk, resetDesk } from "@/desk/store";

const OWNER = "cd:owner";
const getOwner = () => { try { return window.localStorage.getItem(OWNER); } catch { return null; } };
const setOwner = (id: string) => { try { window.localStorage.setItem(OWNER, id); } catch { /* ignore */ } };

/**
 * Keeps a signed-in user's plans in their account without a manual step.
 * - Signs in on a browser with no setup: restores the saved copy.
 * - Setup done here and nothing saved yet: saves it, then re-saves after each change.
 * - Both exist and differ: asks which to keep. Nothing is overwritten without a local backup.
 */
const BACKUP = "cd:backup-before-restore";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function backup(label: string, data: unknown) {
  try {
    window.localStorage.setItem(BACKUP, JSON.stringify({ at: new Date().toISOString(), label, data }));
  } catch {
    /* storage full: the choice still proceeds */
  }
}

export function AutoSync() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [conflict, setConflict] = useState<NonNullable<Remote> | null>(null);
  const [foreign, setForeign] = useState(false);
  const [note, setNote] = useState("");
  const ready = useRef(false);
  const last = useRef("");

  useEffect(() => {
    ready.current = false;
    last.current = "";
    setConflict(null);
    setForeign(false);
    if (!uid) return;
    let dead = false;
    void (async () => {
      const { remote, error } = await fetchRemote(uid);
      if (dead) return;
      if (error) {
        setNote(`Could not reach your saved copy: ${error}`);
        return;
      }
      const remoteUsable = !!remote && !!remote.state?.desk?.profile?.setupDone;
      const localSetup = getDesk().profile.setupDone;
      const owner = getOwner();
      const otherAccount = localSetup && !!owner && owner !== uid;
      if (otherAccount) {
        // Plans in this browser belong to a different account. Never copy them into this one silently.
        backup("plans left in this browser by another account", localBundle());
        if (remote && remoteUsable) {
          const e = applyRemote(remote);
          if (e) setNote(e);
          else {
            setOwner(uid);
            last.current = stable(localBundle());
            ready.current = true;
          }
        } else {
          setForeign(true);
        }
        return;
      }
      if (remote && remoteUsable) {
        if (!localSetup) {
          const e = applyRemote(remote);
          if (e) setNote(e);
          else {
            setOwner(uid);
            last.current = stable(localBundle());
            ready.current = true;
          }
          return;
        }
        if (stable(localBundle()) === stable(remote.state)) {
          setOwner(uid);
          last.current = stable(localBundle());
          ready.current = true;
          return;
        }
        setConflict(remote);
        return;
      }
      if (localSetup) setOwner(uid);
      ready.current = true;
    })();
    return () => {
      dead = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const tick = async () => {
      if (!ready.current || conflict || foreign || !getDesk().profile.setupDone) return;
      const now = stable(localBundle());
      if (now === last.current) return;
      last.current = now;
      const e = await pushLocal(uid);
      if (e) {
        last.current = "";
        setNote(`Not saved to your account yet: ${e}`);
      } else {
        setOwner(uid);
        setNote("");
      }
    };
    const id = window.setInterval(() => void tick(), 4000);
    const onHide = () => {
      if (document.visibilityState === "hidden") void tick();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [uid, conflict, foreign]);

  const box = { position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 50, background: "#fff", border: "1px solid #c9d4e6", borderRadius: 12, padding: 14, boxShadow: "0 8px 30px rgba(20,25,35,.18)", fontSize: 15, maxWidth: 560 } as const;

  if (conflict && uid) {
    const when = new Date(conflict.updated_at).toLocaleString();
    return (
      <div style={box} role="alertdialog" aria-label="Choose which saved copy to keep">
        <p style={{ margin: "0 0 10px" }}>Your account has a saved copy from {when}, and this browser has different plans. Which one do you want to keep? The other is kept as a backup in this browser.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="dk-btn" style={{ fontSize: 16, padding: "10px 16px" }} onClick={() => {
            backup("this browser before restoring account copy", localBundle());
            const e = applyRemote(conflict);
            if (e) setNote(e);
            else {
              setOwner(uid);
              last.current = stable(localBundle());
              ready.current = true;
              setConflict(null);
            }
          }}>Use my account copy</button>
          <button type="button" className="dk-btn secondary" style={{ fontSize: 16, padding: "10px 16px" }} onClick={() => {
            backup("account copy before saving this browser", conflict.state);
            setOwner(uid);
            last.current = "";
            ready.current = true;
            setConflict(null);
          }}>Keep this browser's copy</button>
        </div>
      </div>
    );
  }
  if (foreign && uid) {
    return (
      <div style={box} role="alertdialog" aria-label="Plans from another account">
        <p style={{ margin: "0 0 10px" }}>This browser has plans that were saved under a different account, and this account has no saved copy yet. What should happen to them?</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="dk-btn" style={{ fontSize: 16, padding: "10px 16px" }} onClick={() => {
            setOwner(uid);
            last.current = "";
            ready.current = true;
            setForeign(false);
          }}>Save them to this account</button>
          <button type="button" className="dk-btn secondary" style={{ fontSize: 16, padding: "10px 16px" }} onClick={() => {
            resetDesk();
            setOwner(uid);
            last.current = stable(localBundle());
            ready.current = true;
            setForeign(false);
          }}>Start fresh here</button>
        </div>
      </div>
    );
  }
  if (note) return <div style={box} role="status">{note}</div>;
  return null;
}
