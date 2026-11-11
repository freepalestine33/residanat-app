import handler from '../../api/ai/generate-card-image';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
