import handler from '../../api/lectures/index';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
