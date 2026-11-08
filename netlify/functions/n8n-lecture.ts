import handler from '../../api/webhooks/n8n-lecture';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
