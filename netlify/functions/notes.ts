import handler from '../../api/notes/index';
import { netlifyHandler } from './_adapter';

export default netlifyHandler(handler);
