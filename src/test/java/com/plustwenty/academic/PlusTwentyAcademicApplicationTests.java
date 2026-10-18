package com.plustwenty.academic;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:testdb")
class PlusTwentyAcademicApplicationTests {

	@Test
	void contextLoads() {
	}

}
