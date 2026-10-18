
DROP POLICY "org read" ON public.organizations;
CREATE POLICY "org read" ON public.organizations FOR SELECT TO authenticated USING (
  public.has_ws_role(workspace_id, 'super_admin')
  OR (public.is_member(workspace_id) AND created_by = auth.uid())
  OR public.can_access_org(id));
DROP POLICY "campaign read" ON public.campaigns;
CREATE POLICY "campaign read" ON public.campaigns FOR SELECT TO authenticated USING (
  public.has_ws_role(workspace_id, 'super_admin') OR public.has_ws_role(workspace_id, 'viewer')
  OR (public.is_member(workspace_id) AND created_by = auth.uid()));
