import handler from '../../api/lectures/[id]';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
