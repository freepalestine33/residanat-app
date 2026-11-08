import handler from '../../api/ai/generate-lecture';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
