import './leaderboard.component.css';

export interface LeaderboardRow {
    rankString: string;
    name: string;
    points: number;
    kills: number;
    deaths: number;
}

export class LeaderboardComponent {
    private element!: HTMLDivElement;
    private isFolded: boolean = false;

    constructor() {
        this.createDOM();
    }

    private createDOM() {
        this.element = document.createElement('div');
        this.element.id = 'game-leaderboard';

        this.element.innerHTML = `
            <div class="lb-header">
                <span class="lb-title">LEADERBOARD</span>
                <svg class="lb-podium-icon" viewBox="0 0 24 24">
                    <path d="M4 11h3v11H4zm5-7h3v18H9zm5 10h3v8h-3zm5-4h3v12h-3z"/>
                </svg>
                <button class="lb-toggle-btn" title="Minimize">—</button>
            </div>
            <div id="lb-rows"></div>
        `;

        document.body.appendChild(this.element);
        this.setupEvents();
    }

    private setupEvents() {
        const toggleBtn = this.element.querySelector('.lb-toggle-btn');

        toggleBtn?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevents clicks from triggering standard game scene canvas hooks
            this.toggleFold();
        });

        this.element.addEventListener('click', () => {
            if (this.isFolded) {
                this.toggleFold();
            }
        });
    }

    public toggleFold() {
        this.isFolded = !this.isFolded;
        if (this.isFolded) {
            this.element.classList.add('folded');
        } else {
            this.element.classList.remove('folded');
        }
    }

    public update(data: LeaderboardRow[]) {
        const rowsContainer = this.element.querySelector('#lb-rows');
        if (!rowsContainer) return;

        rowsContainer.innerHTML = '';

        data.forEach(player => {
            const row = document.createElement('div');
            row.className = 'lb-row';

            const ptsClass = player.points < 0 ? 'lb-pts negative' : 'lb-pts';

            row.innerHTML = `
                <div class="lb-rank">${player.rankString}</div>
                <div class="lb-name" title="${player.name}">${player.name}</div>
                <div class="${ptsClass}">${player.points} pts</div>
                <div class="lb-stat-box">
                    <div class="lb-stat-val">${player.kills}</div>
                    <div class="lb-stat-lbl">Kills</div>
                </div>
                <div class="lb-stat-box">
                    <div class="lb-stat-val">${player.deaths}</div>
                    <div class="lb-stat-lbl">Deaths</div>
                </div>
            `;

            rowsContainer.appendChild(row);
        });
    }

    public destroy() {
        this.element?.remove();
    }
}