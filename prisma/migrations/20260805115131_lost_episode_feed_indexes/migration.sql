-- CreateIndex
CREATE INDEX "lost_episodes_foundAt_lostAt_idx" ON "lost_episodes"("foundAt", "lostAt");

-- CreateIndex
CREATE INDEX "lost_episodes_lat_lng_idx" ON "lost_episodes"("lat", "lng");
