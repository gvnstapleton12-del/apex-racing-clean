-- Historical Runner Analysis Table
-- Stores immutable engine signal trees for replay + learning

CREATE TABLE IF NOT EXISTS historical_runner_analysis (
    id BIGSERIAL PRIMARY KEY,

    race_id VARCHAR(255) NOT NULL,
    run_id VARCHAR(255) NOT NULL,

    horse_id VARCHAR(255) NOT NULL,
    horse_name VARCHAR(255) NOT NULL,

    generated_at TIMESTAMP DEFAULT NOW(),

    signal_snapshot JSONB NOT NULL,
    score_snapshot JSONB NOT NULL,
    commentary_snapshot JSONB NOT NULL,

    final_score DECIMAL(5,2) NOT NULL,

    verdict VARCHAR(50) NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX idx_hra_race_id ON historical_runner_analysis(race_id);
CREATE INDEX idx_hra_horse_id ON historical_runner_analysis(horse_id);
CREATE INDEX idx_hra_verdict ON historical_runner_analysis(verdict);
CREATE INDEX idx_hra_generated_at ON historical_runner_analysis(generated_at);
CREATE INDEX idx_hra_final_score ON historical_runner_analysis(final_score);

-- Composite index for replay queries
CREATE INDEX idx_hra_race_horse ON historical_runner_analysis(race_id, horse_id);

-- Example query: "Show me exactly what the model believed at 10:42am before the market move"
-- SELECT signal_snapshot, score_snapshot, commentary_snapshot
-- FROM historical_runner_analysis
-- WHERE horse_id = 'desert_crown'
-- AND generated_at < '2026-05-26T10:42:00Z'
-- ORDER BY generated_at DESC
-- LIMIT 1;

-- Example query: "Why did the model like this horse?"
-- SELECT commentary_snapshot->>'positives' AS positives,
--        commentary_snapshot->>'negatives' AS negatives,
--        signal_snapshot->'paceEngine' AS pace_signals,
--        signal_snapshot->'hiddenImprover' AS hidden_signals,
--        signal_snapshot->'finishingStrength' AS finishing_signals,
--        score_snapshot->>'marketAdjustment' AS market_move,
--        score_snapshot->>'volatilityAdjustment' AS volatility
-- FROM historical_runner_analysis
-- WHERE horse_id = 'desert_crown'
-- AND race_id = 'ascot_2026_05_26_15_30';
