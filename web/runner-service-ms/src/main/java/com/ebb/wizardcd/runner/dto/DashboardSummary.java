package com.ebb.wizardcd.runner.dto;

public class DashboardSummary {

    private int total;
    private int running;
    private int successful;
    private int failed;
    private int aborted;

    private Trends trends;

    public DashboardSummary(int total,
                            int running,
                            int successful,
                            int failed,
                            int aborted,
                            Trends trends) {
        this.total = total;
        this.running = running;
        this.successful = successful;
        this.failed = failed;
        this.aborted = aborted;
        this.trends = trends;
    }

    public static class Trends {
        private int running;
        private int successful;
        private int failed;
        private int aborted;

        public Trends(int running,
                      int successful,
                      int failed,
                      int aborted) {
            this.running = running;
            this.successful = successful;
            this.failed = failed;
            this.aborted = aborted;
        }

        public int getRunning() { return running; }
        public int getSuccessful() { return successful; }
        public int getFailed() { return failed; }
        public int getAborted() { return aborted; }
    }

    public int getTotal() { return total; }
    public int getRunning() { return running; }
    public int getSuccessful() { return successful; }
    public int getFailed() { return failed; }
    public int getAborted() { return aborted; }
    public Trends getTrends() { return trends; }
}