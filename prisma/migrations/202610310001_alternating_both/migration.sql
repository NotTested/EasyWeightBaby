-- Expand the allowed set-side values without rewriting any existing performance data.
ALTER TABLE "WorkoutSet"
 DROP CONSTRAINT "WorkoutSet_side_check",
 ADD CONSTRAINT "WorkoutSet_side_check" CHECK ("side" IN ('unspecified', 'both', 'alternating_both', 'left', 'right'));
