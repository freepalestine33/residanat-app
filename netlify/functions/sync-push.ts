import handler from '../../api/sync/push';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
