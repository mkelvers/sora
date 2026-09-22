import { createCatalogSource } from '@soraorg/core/catalog/anikoto-source';
import { createCatalogApplication } from '@soraorg/core/catalog/application';

export const catalogApplication = createCatalogApplication(createCatalogSource());
