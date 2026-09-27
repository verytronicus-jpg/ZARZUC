/** Dziennik połowów i rekordy (localStorage w try/catch – gra działa także bez niego). */
import type { SpeciesId } from '../config';

interface LogEntry {
  species: SpeciesId;
  lengthCm: number;
  weightG: number;
  date: string;
  fightTime: number;
}

interface SaveData {
  version: 1;
  entries: LogEntry[];
  records: Partial<Record<SpeciesId, LogEntry>>;
}

const KEY = 'zarzuc.log.v1';
/** zapis z wersji roboczej "Na Ryby" – przenoszony przy pierwszym uruchomieniu */
const LEGACY_KEY = 'na-ryby.log.v1';

export class CatchLog {
  entries: LogEntry[] = [];
  records: Partial<Record<SpeciesId, LogEntry>> = {};
  storageOk = true;

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = CatchLog.defaultStorage()) {
    this.load();
  }

  static defaultStorage(): Storage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  private load(): void {
    try {
      const raw = this.storage?.getItem(KEY) ?? this.storage?.getItem(LEGACY_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as SaveData;
      if (d && d.version === 1 && Array.isArray(d.entries)) {
        this.entries = d.entries;
        this.records = d.records ?? {};
      }
    } catch {
      this.storageOk = false;
    }
  }

  private save(): void {
    try {
      const d: SaveData = { version: 1, entries: this.entries.slice(-200), records: this.records };
      this.storage?.setItem(KEY, JSON.stringify(d));
    } catch {
      this.storageOk = false;
    }
  }

  /** Dodaje połów; zwraca true, jeśli to nowy rekord gatunku (wg wagi). */
  add(e: LogEntry): boolean {
    this.entries.push(e);
    const prev = this.records[e.species];
    const isRecord = !prev || e.weightG > prev.weightG;
    if (isRecord) this.records[e.species] = e;
    this.save();
    return isRecord;
  }
}
