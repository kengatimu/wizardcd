package com.ebb.wizardcd.runner;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class RunnerServiceApplicationTests {

	@Test
	void contextLoads() {
		// Boots full Spring context with H2 (test profile).
		// Verifies wiring across web + data + security + JPA + Flyway.
	}

}
