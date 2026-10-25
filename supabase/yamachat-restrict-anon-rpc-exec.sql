-- These SECURITY DEFINER RPCs perform authenticated user or membership checks.
-- Keep them available to signed-in Yamachat clients, but remove anonymous and
-- PUBLIC execution. list_public_communities intentionally remains public.
REVOKE EXECUTE ON FUNCTION public.assign_community_role(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_community_role(uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.award_stream_xp(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_stream_xp(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.award_voice_xp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_voice_xp(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_community_role(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_community_role(uuid, text, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_community_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_community_role(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_community_role(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_community_role(uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rename_community(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_community(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.report_profile(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_profile(uuid, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_community_server_color(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_community_server_color(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_community_role(uuid, text, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_community_role(uuid, text, text, integer, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_community_settings(uuid, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_community_settings(uuid, text, text, boolean, text) TO authenticated;
