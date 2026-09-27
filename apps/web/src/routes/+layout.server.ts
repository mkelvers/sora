import isMobile from 'is-mobile';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ request }) => {
	return {
		mobile: isMobile({
			ua: request.headers.get('user-agent') ?? '',
			tablet: true
		})
	};
};
