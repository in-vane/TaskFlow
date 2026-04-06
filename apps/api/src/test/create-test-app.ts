import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";

export async function createTestApp(
  moduleFactory: () => Promise<TestingModule>
): Promise<INestApplication> {
  const moduleRef = await moduleFactory();
  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  await app.init();

  return app;
}

export function createTestingModule(
  metadata: Parameters<typeof Test.createTestingModule>[0]
) {
  return Test.createTestingModule(metadata);
}
