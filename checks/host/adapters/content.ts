import { z } from 'zod/v4';
import { RichNodeSchema } from '@aegis/domain/schema';
import { productionModule } from './module.ts';
// These original copy fixtures deliberately omit geometry and other unrelated Card fields.
const content = await productionModule('@aegis/domain/content');
export function cardContent(card: unknown) { return z.array(RichNodeSchema).parse(content.call('cardContent', card)); }
