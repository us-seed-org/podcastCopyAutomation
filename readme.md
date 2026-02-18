# Environment Variables Migration Note

## MINIMAX_SCORING_MODEL (New)
The `MINIMAX_SCORING_MODEL` environment variable is now the preferred way to configure the scoring model.
- Default: `minimax-m2.5`
- Example: `MINIMAX_SCORING_MODEL=minimax-m2.5`

## SCORING_MODEL (Deprecated - Fallback Only)
`SCORING_MODEL` is kept for backward compatibility but will only be used as a fallback if `MINIMAX_SCORING_MODEL` is not set.
Please migrate to using `MINIMAX_SCORING_MODEL`.

---

a