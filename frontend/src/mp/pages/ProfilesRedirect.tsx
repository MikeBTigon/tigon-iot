import { Navigate, useSearchParams } from 'react-router-dom';

/** Old "Profiles" page: now a tab on Users; "edit my profile" (?me=1) lives in Settings → My account. */
export default function ProfilesRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={params.get('me') ? '/settings' : '/users?tab=profiles'} replace />;
}
