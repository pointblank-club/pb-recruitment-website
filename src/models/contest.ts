export const formatEligibleYears = (years?: number[]): string => {
    if (!years || years.length === 0) {
        return "All Years";
    }
    const suffixes: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };
    const sorted = [...years].sort((a, b) => a - b);
    if (sorted.length === 1) {
        return `${suffixes[sorted[0]] || sorted[0] + "th"} Year`;
    }
    const formatted = sorted.map(y => suffixes[y] || `${y}th`);
    return `${formatted.slice(0, -1).join(", ")} & ${formatted[formatted.length - 1]} Year`;
};

export class Contest {
    id: string;
    name: string;
    description: string;
    start_time: number;
    end_time: number;
    registration_start_time: number;
    registration_end_time: number;
    eligible_to: number[];
    is_registered?: boolean;

    constructor(data: {
        id: string;
        name: string;
        description: string;
        start_time: number;
        end_time: number;
        registration_start_time: number;
        registration_end_time: number;
        eligible_to: number[];
        is_registered?: boolean;
    }) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.start_time = data.start_time;
        this.end_time = data.end_time;
        this.registration_start_time = data.registration_start_time;
        this.registration_end_time = data.registration_end_time;
        this.eligible_to = data.eligible_to;
        this.is_registered = data.is_registered ?? false;
    }

    isRegistrationOpen(): boolean {
        const now = Date.now();
        return now >= this.registration_start_time && now <= this.registration_end_time;
    }

    isContestOngoing(): boolean {
        const now = Date.now();
        return now >= this.start_time && now <= this.end_time;
    }

    duration(): string {
        const durationMs = this.end_time - this.start_time;
        const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
        const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${durationHours}h ${durationMinutes}m`;
    }

    formatEligibleYears(): string {
        return formatEligibleYears(this.eligible_to);
    }
}
