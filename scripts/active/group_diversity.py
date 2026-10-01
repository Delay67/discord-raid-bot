"""Compare player relationships, ignoring character, role, color and run order."""

from collections import Counter, defaultdict
from itertools import combinations


def player_pair_counts(roster, runs):
    characters = {c.id: c for c in roster.characters}
    pairs = Counter()
    for run in runs:
        players = sorted(characters[m["characterId"]].player for m in run["members"])
        pairs.update(combinations(players, 2))
    return pairs


def pairing_overlap(left, right):
    return sum(min(count, right[pair]) for pair, count in left.items())


def pairing_distance(left, right):
    """Fraction changed in BOTH samples; padding with extra runs cannot help."""
    size = min(sum(left.values()), sum(right.values()))
    return 1 - pairing_overlap(left, right) / size if size else 0.0


def add_diversity_constraints(model, templates, counts, previous_pairs, percent):
    if not previous_pairs or percent == 0:
        return
    pair_terms = defaultdict(list)
    total_pairings = []
    for template, variable in zip(templates, counts):
        pairs = list(combinations(template.players, 2))
        total_pairings.append(len(pairs) * variable)
        for pair in pairs:
            pair_terms[pair].append(variable)
    for index, previous in enumerate(previous_pairs):
        overlaps = []
        for pair_index, (pair, count) in enumerate(sorted(previous.items())):
            shared = model.new_int_var(0, count, f"shared_pairs_{index}_{pair_index}")
            model.add_min_equality(shared, [count, sum(pair_terms[pair])])
            overlaps.append(shared)
        overlap = sum(overlaps)
        model.add(100 * overlap <= (100 - percent) * sum(previous.values()))
        model.add(100 * overlap <= (100 - percent) * sum(total_pairings))


def validate_samples(roster, solutions, diversity_percent, max_score_gap):
    """Independently verify the final collection, after sorting/filtering."""
    if not solutions:
        return {"diversityPercent": diversity_percent, "maxScoreGap": max_score_gap,
                "bestScore": None, "comparisons": []}
    best = min(s["score"]["totalPenalty"] for s in solutions)
    pairs = [player_pair_counts(roster, s["runs"]) for s in solutions]
    comparisons = []
    for index, solution in enumerate(solutions):
        gap = solution["score"]["totalPenalty"] - best
        if gap > max_score_gap:
            raise ValueError("Sample exceeds the allowed penalty gap from the best returned solution")
        solution["scoreGapFromBest"] = gap
    for left, right in combinations(range(len(solutions)), 2):
        overlap = pairing_overlap(pairs[left], pairs[right])
        for sample in (pairs[left], pairs[right]):
            if 100 * overlap > (100 - diversity_percent) * sum(sample.values()):
                raise ValueError("Samples do not meet the requested player-pairing diversity")
        comparisons.append({"solutions": [left + 1, right + 1],
                            "changedPairingsPercent": round(100 * pairing_distance(pairs[left], pairs[right]), 2)})
    return {"diversityPercent": diversity_percent, "maxScoreGap": max_score_gap,
            "bestScore": best, "comparisons": comparisons}
