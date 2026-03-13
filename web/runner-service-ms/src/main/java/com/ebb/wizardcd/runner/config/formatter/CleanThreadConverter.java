package com.ebb.wizardcd.runner.config.formatter;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;

public class CleanThreadConverter extends ClassicConverter {
    @Override
    public String convert(ILoggingEvent event) {
        String threadName = event.getThreadName();
        if (threadName == null) return "";

        // Remove trailing timestamp (e.g., 2025-07-15T10:15:44.090642)
        threadName = threadName.replaceAll("\\s*\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}$", "").trim();

        // Extract base and class segments
        int lastSpace = threadName.lastIndexOf(' ');
        if (lastSpace == -1 || lastSpace == threadName.length() - 1) {
            return threadName; // Fallback if structure unexpected
        }

        String prefix = threadName.substring(0, lastSpace); // e.g., "papss-credit-transfer-tm-1:1 prepare"
        String classFull = threadName.substring(lastSpace + 1); // e.g., "com.equitybank.gag.papss...ISO8583MessageBuilderParticipant"

        // Extract the class name from full package (last token after dot)
        String classSimple = classFull.contains(".") ? classFull.substring(classFull.lastIndexOf('.') + 1) : classFull;

        // Return cleaned format
        return prefix + " " + classSimple;
    }
}
