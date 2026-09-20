/**
 * Leaderboard ranking with hidden tie-breakers. Pure functions, no DOM.
 */

// Primary sort is the visible `score`. Ties fall through to the silent
// hiddenTieBreakerScore. Only when BOTH are exactly equal do two players
// genuinely share a rank — a rare, honest last resort rather than the norm.
export function comparePlayersForRank(a, b) {
    const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const aHidden = Number(a.stats && a.stats.hiddenTieBreakerScore) || 0;
    const bHidden = Number(b.stats && b.stats.hiddenTieBreakerScore) || 0;
    return bHidden - aHidden;
}

// Groups players into DENSE competition ranks (1, 2, 2, 3, ...): a tie
// never causes the next distinct rank to skip a number. The rank for a
// new group is based on how many rank groups exist so far — NOT the
// sorted array index — otherwise two players tied for rank 2 would push
// the next player to rank 4 instead of rank 3.
export function getRankedStandings(players) {
    const sorted = [...players].sort(comparePlayersForRank);
    const groups = [];
    sorted.forEach((p, idx) => {
        const prev = sorted[idx - 1];
        const tiedWithPrev = prev && comparePlayersForRank(prev, p) === 0;
        if (tiedWithPrev) {
            groups[groups.length - 1].players.push(p);
        } else {
            groups.push({ rank: groups.length + 1, score: Number(p.score) || 0, players: [p] });
        }
    });
    return groups;
}
