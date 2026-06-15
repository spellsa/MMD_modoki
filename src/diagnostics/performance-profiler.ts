export type PerformanceSectionSummary = {
    samples: number;
    avgMs: number | null;
    maxMs: number | null;
};

type PerformanceSectionStats = {
    samples: number;
    totalMs: number;
    maxMs: number;
};

export class PerformanceProfiler<TSection extends string> {
    private readonly stats: Record<TSection, PerformanceSectionStats>;

    constructor(private readonly sections: readonly TSection[]) {
        this.stats = this.createStats();
    }

    record(section: TSection, durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) return;
        const stats = this.stats[section];
        if (!stats) return;
        stats.samples += 1;
        stats.totalMs += durationMs;
        stats.maxMs = Math.max(stats.maxMs, durationMs);
    }

    measure<T>(section: TSection, callback: () => T, now: () => number = () => performance.now()): T {
        const startMs = now();
        try {
            return callback();
        } finally {
            this.record(section, now() - startMs);
        }
    }

    summarize(): Record<TSection, PerformanceSectionSummary> {
        const summary = {} as Record<TSection, PerformanceSectionSummary>;
        for (const section of this.sections) {
            const stats = this.stats[section];
            summary[section] = {
                samples: stats.samples,
                avgMs: stats.samples > 0 ? roundMilliseconds(stats.totalMs / stats.samples) : null,
                maxMs: stats.samples > 0 ? roundMilliseconds(stats.maxMs) : null,
            };
        }
        return summary;
    }

    reset(): void {
        for (const section of this.sections) {
            const stats = this.stats[section];
            stats.samples = 0;
            stats.totalMs = 0;
            stats.maxMs = 0;
        }
    }

    summarizeAndReset(): Record<TSection, PerformanceSectionSummary> {
        const summary = this.summarize();
        this.reset();
        return summary;
    }

    private createStats(): Record<TSection, PerformanceSectionStats> {
        const stats = {} as Record<TSection, PerformanceSectionStats>;
        for (const section of this.sections) {
            stats[section] = {
                samples: 0,
                totalMs: 0,
                maxMs: 0,
            };
        }
        return stats;
    }
}

export function normalizePerformanceLogMode(value: unknown): "off" | "summary" | "trace" {
    if (typeof value !== "string") return "off";
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "summary") return "summary";
    if (normalized === "trace") return "trace";
    return "off";
}

export function roundMilliseconds(value: number): number {
    return Math.round(value * 1000) / 1000;
}
