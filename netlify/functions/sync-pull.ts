import handler from '../../api/sync/pull';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
