import unreal

# ============================================================
#  配置区
# ============================================================

DEFAULT_ROOT_PATH  = "/Game/Developers/taobe/Voxel/20260429/"
PREFIX_SM          = "SM_"
PREFIX_MI          = "MI_"
PREFIX_T           = "T_"
TEXTURE_PARAM_NAME = "BaseColor"

# ============================================================
#  核心逻辑
# ============================================================

eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
ar  = unreal.AssetRegistryHelpers.get_asset_registry()

def get_base_name(asset_name, prefix):
    if asset_name.startswith(prefix):
        return asset_name[len(prefix):]
    return asset_name

def find_asset_by_names(folder_path, valid_names):
    assets = ar.get_assets_by_path(folder_path, recursive=False)
    for a in assets:
        name = str(a.asset_name)
        if name in valid_names:
            return a
    return None

def resolve_root_path():
    # 优先读取当前激活的 Content Browser 路径；若当前 UE 版本未暴露该接口，
    # 则退化到“选中的文件夹”或“选中资源所在目录”，最后再回退到默认路径。
    if hasattr(unreal.EditorUtilityLibrary, "get_current_content_browser_path"):
        current_path = unreal.EditorUtilityLibrary.get_current_content_browser_path()
        if current_path:
            return str(current_path)

    selected_folders = unreal.EditorUtilityLibrary.get_selected_folder_paths()
    if selected_folders:
        return str(selected_folders[0])

    selected_asset_data = unreal.EditorUtilityLibrary.get_selected_asset_data()
    if selected_asset_data:
        return str(selected_asset_data[0].package_path)

    return DEFAULT_ROOT_PATH

def run():
    root_path = resolve_root_path()

    unreal.log("=" * 60)
    unreal.log(f"[AutoAssign] 开始扫描: {root_path}")
    unreal.log("=" * 60)

    all_assets = ar.get_assets_by_path(root_path, recursive=True)
    sm_assets  = [
        a for a in all_assets
        if str(a.asset_class_path.asset_name) == "StaticMesh"
    ]

    if not sm_assets:
        unreal.log_warning(f"[AutoAssign] 未找到任何 StaticMesh，请检查路径: {root_path}")
        return

    success = 0
    fail    = 0
    dirty   = []

    with unreal.ScopedSlowTask(len(sm_assets), "自动绑定中...") as task:
        task.make_dialog(True)

        for sm_data in sm_assets:
            if task.should_cancel():
                break

            sm_name     = str(sm_data.asset_name)
            sm_pkg_path = str(sm_data.package_path)
            task.enter_progress_frame(1, sm_name)

            base       = get_base_name(sm_name, PREFIX_SM)
            mi_folder  = f"{sm_pkg_path}/Material"
            tex_folder = f"{sm_pkg_path}/Texture"

            mi_names = [f"{PREFIX_MI}{base}", f"{PREFIX_MI}{base}_Color"]
            t_names  = [f"{PREFIX_T}{base}", f"{PREFIX_T}{base}_Color"]

            mi_data = find_asset_by_names(mi_folder, mi_names)
            t_data  = find_asset_by_names(tex_folder, t_names)

            if not mi_data:
                unreal.log_error(f"  [MISS MI ] {sm_name} → 在 {mi_folder} 找不到 {mi_names}")
                fail += 1
                continue

            if not t_data:
                unreal.log_error(f"  [MISS TEX] {sm_name} → 在 {tex_folder} 找不到 {t_names}")
                fail += 1
                continue

            mi_path = f"{str(mi_data.package_path)}/{str(mi_data.asset_name)}"
            t_path  = f"{str(t_data.package_path)}/{str(t_data.asset_name)}"

            mi_obj = mi_data.get_asset()
            try:
                mi_asset = unreal.MaterialInstanceConstant.cast(mi_obj)
            except TypeError:
                unreal.log_error(f"  [TYPE ERROR] MI ({mi_path}): 实际类型是 {mi_obj.get_class().get_name()}，不是 MaterialInstanceConstant")
                mi_asset = None

            t_obj = t_data.get_asset()
            try:
                t_asset = unreal.Texture.cast(t_obj)
            except TypeError:
                unreal.log_error(f"  [TYPE ERROR] Texture ({t_path}): 实际类型是 {t_obj.get_class().get_name()}，不是 Texture")
                t_asset = None

            sm_obj = sm_data.get_asset()
            try:
                sm_asset = unreal.StaticMesh.cast(sm_obj)
            except TypeError:
                unreal.log_error(f"  [TYPE ERROR] StaticMesh ({sm_name}): 实际类型是 {sm_obj.get_class().get_name()}，不是 StaticMesh")
                sm_asset = None

            if not mi_asset:
                unreal.log_error(f"  [CAST FAIL] MI 加载失败: {mi_path}")
                fail += 1
                continue

            if not t_asset:
                unreal.log_error(f"  [CAST FAIL] Texture 加载失败: {t_path}")
                fail += 1
                continue

            if not sm_asset:
                unreal.log_error(f"  [CAST FAIL] StaticMesh 加载失败: {sm_name}")
                fail += 1
                continue

            # Texture → MI 参数
            is_set_success = mel.set_material_instance_texture_parameter_value(
                mi_asset, TEXTURE_PARAM_NAME, t_asset
            )
            
            mi_name = mi_path.split("/")[-1]
            if not is_set_success:
                unreal.log_warning(f"  [PARAM MISSING] 材质实例 {mi_name} 中没有找到参数 '{TEXTURE_PARAM_NAME}'！赋值失败。")

            # 对于 Material Instance，更新参数后必须调用 update_material_instance 才能在编辑器中生效
            mel.update_material_instance(mi_asset)

            # MI → SM Slot 0（仅修改，不保存）
            sm_asset.set_material(0, mi_asset)

            mi_name = mi_path.split("/")[-1]
            t_name  = t_path.split("/")[-1]
            dirty.append(mi_path)
            dirty.append(f"{sm_pkg_path}/{sm_name}")

            unreal.log(f"  [OK] {sm_name}")
            unreal.log(f"       └─ T  {t_name}")
            unreal.log(f"       └─ MI {mi_name}")
            success += 1

    unreal.log("=" * 60)
    unreal.log(f"[AutoAssign] 完成！✅ 成功: {success}  ❌ 失败: {fail}")
    unreal.log("")
    unreal.log("以下资产已修改但未保存，请在 Content Browser 手动保存：")
    for path in dirty:
        unreal.log(f"  ● {path}")
    unreal.log("=" * 60)

run()
