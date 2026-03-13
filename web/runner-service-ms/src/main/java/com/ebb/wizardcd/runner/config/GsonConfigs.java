package com.ebb.wizardcd.runner.config;

import com.google.gson.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.lang.reflect.Type;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;

@Configuration
public class GsonConfigs {

    // Adapter for LocalDateTime → ISO string
    static class LocalDateTimeAdapter implements JsonSerializer<LocalDateTime>, JsonDeserializer<LocalDateTime> {
        @Override
        public JsonElement serialize(LocalDateTime value, Type type, JsonSerializationContext context) {
            return new JsonPrimitive(value.toString()); // e.g., "2025-05-17T15:30:00"
        }

        @Override
        public LocalDateTime deserialize(JsonElement json, Type type, JsonDeserializationContext context) {
            return LocalDateTime.parse(json.getAsString());
        }
    }

    // Adapter for OffsetDateTime → ISO string with offset
    static class OffsetDateTimeAdapter implements JsonSerializer<OffsetDateTime>, JsonDeserializer<OffsetDateTime> {
        @Override
        public JsonElement serialize(OffsetDateTime value, Type type, JsonSerializationContext context) {
            return new JsonPrimitive(value.toString()); // e.g., "2025-05-17T15:30:00+03:00"
        }

        @Override
        public OffsetDateTime deserialize(JsonElement json, Type type, JsonDeserializationContext context) {
            return OffsetDateTime.parse(json.getAsString());
        }
    }

    @Bean (name = "gson")
    public Gson gson() {
        return new GsonBuilder()
                .registerTypeAdapter(LocalDateTime.class, new LocalDateTimeAdapter()) // Handles LocalDateTime
                .registerTypeAdapter(OffsetDateTime.class, new OffsetDateTimeAdapter()) // Handles OffsetDateTime
                .disableHtmlEscaping() // Needed for Base64: avoids escaping '=' and '+' which would corrupt encoded strings
                .setPrettyPrinting()   // Makes the JSON easier to read
                .create();
    }
}
