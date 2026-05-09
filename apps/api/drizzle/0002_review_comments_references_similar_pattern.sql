ALTER TABLE review_comments
ADD COLUMN IF NOT EXISTS references_similar_pattern TEXT;
