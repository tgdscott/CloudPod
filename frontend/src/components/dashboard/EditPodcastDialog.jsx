import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { makeApi, isApiError } from "@/lib/apiClient";

// Basic subset of Spreaker language codes; extend as needed
const LANG_OPTIONS = [
	{ code: "en", label: "English" },
	{ code: "es", label: "Spanish" },
	{ code: "fr", label: "French" },
	{ code: "de", label: "German" },
	{ code: "it", label: "Italian" },
	{ code: "pt", label: "Portuguese" },
	{ code: "pt-br", label: "Portuguese (Brazil)" },
	{ code: "nl", label: "Dutch" },
	{ code: "sv", label: "Swedish" },
	{ code: "no", label: "Norwegian" },
	{ code: "da", label: "Danish" },
	{ code: "fi", label: "Finnish" },
	{ code: "pl", label: "Polish" },
	{ code: "ru", label: "Russian" },
	{ code: "ja", label: "Japanese" },
	{ code: "zh", label: "Chinese" },
	{ code: "ar", label: "Arabic" },
];

export default function EditPodcastDialog({
	isOpen,
	onClose,
	podcast,
	onSave,
	token,
	userEmail,
}) {
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		cover_path: "",
		podcast_type: "",
		language: "",
		copyright_line: "",
		owner_name: "",
		author_name: "",
		spreaker_show_id: "",
		contact_email: "",
		category_id: "",
		category_2_id: "",
		category_3_id: "",
	});
	const [categories, setCategories] = useState([]);
	const [remoteStatus, setRemoteStatus] = useState({
		loading: false,
		error: "",
		loaded: false,
	});
	const [lastRemote, setLastRemote] = useState(null);
	const [isSaving, setIsSaving] = useState(false);
	const [originalSpreakerId, setOriginalSpreakerId] = useState("");
	const [confirmShowIdChange, setConfirmShowIdChange] = useState(false);
	const [newCoverFile, setNewCoverFile] = useState(null);
	const [coverPreview, setCoverPreview] = useState("");
	const { toast } = useToast();

	// Track if we've done the initial local population to avoid overwriting remote-loaded values
	const initializedFromLocal = useRef(false);
	useEffect(() => {
		if (!podcast) return;
		// If remote already loaded, don't clobber remote values
		if (remoteStatus.loaded) return;
		// Only initialize once per open lifecycle
		if (initializedFromLocal.current && isOpen) return;
		initializedFromLocal.current = true;
		setFormData({
			name: podcast.name || "",
			description: podcast.description || "",
			cover_path: podcast.cover_path || "",
			podcast_type: podcast.podcast_type || "",
			language: podcast.language || "",
			copyright_line: podcast.copyright_line || "",
			owner_name: podcast.owner_name || "",
			author_name: podcast.author_name || "",
			spreaker_show_id: podcast.spreaker_show_id || "",
			contact_email: podcast.contact_email || userEmail || "",
			category_id: podcast.category_id ? String(podcast.category_id) : "",
			category_2_id: podcast.category_2_id ? String(podcast.category_2_id) : "",
			category_3_id: podcast.category_3_id ? String(podcast.category_3_id) : "",
		});
		setOriginalSpreakerId(podcast.spreaker_show_id || "");
		setCoverPreview(resolveCoverURL(podcast.cover_path));
	}, [podcast, remoteStatus.loaded, isOpen, userEmail]);

	// Load remote Spreaker show mapping (preferred source) when dialog opens
	useEffect(() => {
		async function loadRemote() {
			if (!isOpen || !podcast?.id || !token) return;
			setRemoteStatus((s) => ({ ...s, loading: true, error: "" }));
			try {
				const api = makeApi(token);
				const data = await api.get(`/api/spreaker/show/${podcast.id}?mapped=true`);
				const m = data.mapped || {};
				const mergeKeys = [
					"name",
					"description",
					"language",
					"author_name",
					"owner_name",
					"copyright_line",
					"category_id",
					"category_2_id",
					"category_3_id",
					"contact_email",
					"podcast_type",
					"spreaker_show_id",
					"cover_path",
				];
				setFormData((prev) => {
					const merged = { ...prev };
					mergeKeys.forEach((k) => {
						if (m[k] !== undefined && m[k] !== null) merged[k] = String(m[k]);
					});
					return merged;
				});
				setLastRemote(m);
				if (m.cover_path) setCoverPreview(resolveCoverURL(m.cover_path));
				setRemoteStatus({ loading: false, error: "", loaded: true });
			} catch (e) {
				const msg = isApiError(e) ? (e.detail || e.error || e.message) : String(e);
				setRemoteStatus({ loading: false, error: msg || "Failed remote fetch", loaded: false });
			}
		}
		loadRemote();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, podcast?.id, token]);

	// Fetch categories once
	useEffect(() => {
		async function loadCategories() {
			try {
				const api = makeApi(token);
				const data = await api.get("/api/spreaker/categories");
				setCategories(data.categories || []);
			} catch (e) {
				/* silent */
			}
		}
		if (isOpen) loadCategories();
	}, [isOpen, token]);

	const resolveCoverURL = (path) => {
		if (!path) return "";
		if (path.startsWith("http")) return path;
		const filename = path.replace(/^\/+/, "").split("/").pop();
		return `/static/media/${filename}`;
	};

	const handleChange = (e) => {
		const { id, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[id]: value,
		}));
	};

	const handleSelectChange = (id, value) => {
		setFormData((prev) => ({
			...prev,
			[id]: value,
		}));
	};

	const handleCoverFileChange = (e) => {
		const file = e.target.files?.[0];
		if (file) {
			setNewCoverFile(file);
			setCoverPreview(URL.createObjectURL(file));
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		// Guard: if spreaker_show_id changed, require confirmation checkbox
		if (originalSpreakerId && formData.spreaker_show_id && formData.spreaker_show_id !== originalSpreakerId && !confirmShowIdChange) {
			toast({ title: "Confirmation Required", description: "Check the confirmation box to change the Spreaker Show ID.", variant: "destructive" });
			return;
		}
		setIsSaving(true);
		try {
			let updatedPodcast;
			const api = makeApi(token);
			if (newCoverFile) {
				const data = new FormData();
				Object.entries(formData).forEach(([k, v]) => {
					if (v !== undefined && v !== null && v !== "") data.append(k, v);
				});
				data.append("cover_image", newCoverFile);
				if (originalSpreakerId && formData.spreaker_show_id !== originalSpreakerId && confirmShowIdChange) {
					data.append("allow_spreaker_id_change", "true");
				}
				updatedPodcast = await api.raw(`/api/podcasts/${podcast.id}`, { method: "PUT", body: data });
			} else {
				const payload = { ...formData };
				if (originalSpreakerId && formData.spreaker_show_id !== originalSpreakerId && confirmShowIdChange) {
					payload.allow_spreaker_id_change = true;
				}
				updatedPodcast = await api.put(`/api/podcasts/${podcast.id}`, payload);
			}

			onSave(updatedPodcast);
			toast({ title: "Success", description: "Podcast updated successfully." });
			onClose();
		} catch (error) {
			const msg = isApiError(error) ? (error.detail || error.error || error.message) : String(error);
			toast({ title: "Error", description: msg, variant: "destructive" });
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[520px] w-full md:w-[520px]">
				<DialogHeader>
					<DialogTitle>Edit Podcast</DialogTitle>
					<DialogDescription>
						Make changes to your podcast here. Click save when you're done.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="text-xs -mb-1 flex items-center justify-between">
						<span className="text-muted-foreground">
							{remoteStatus.loading && "Loading Spreaker metadata..."}
							{!remoteStatus.loading && remoteStatus.loaded && "Values loaded from Spreaker"}
							{!remoteStatus.loading && remoteStatus.error && `Remote load failed (${remoteStatus.error}) using local data`}
						</span>
						<button
							type="button"
							className="underline text-blue-600"
							onClick={async () => {
								setRemoteStatus({ loading: true, error: "", loaded: false });
								try {
									const api = makeApi(token);
									const data = await api.get(`/api/spreaker/show/${podcast.id}?mapped=true`);
									const m = data.mapped || {};
									const mergeKeys = ['name','description','language','author_name','owner_name','copyright_line','category_id','category_2_id','category_3_id','contact_email','podcast_type','spreaker_show_id','cover_path'];
									setFormData(prev=>{
										const merged={...prev};
										mergeKeys.forEach(k=>{ if(m[k] !== undefined && m[k] !== null){ merged[k]=String(m[k]); } });
										return merged;
									});
									setLastRemote(m);
									if (m.cover_path) setCoverPreview(resolveCoverURL(m.cover_path));
									setRemoteStatus({loading:false,error:"",loaded:true});
								} catch(err){
									const msg = isApiError(err) ? (err.detail || err.error || err.message) : String(err);
									setRemoteStatus({loading:false,error:msg,loaded:false});
								}
							}}
						>
							Refresh
						</button>
					</div>

					<div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
						<div className="space-y-1">
							<Label htmlFor="name">Name</Label>
							<Input id="name" value={formData.name} onChange={handleChange} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="spreaker_show_id">Spreaker Show ID</Label>
							<Input id="spreaker_show_id" value={formData.spreaker_show_id} onChange={handleChange} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="description">Description</Label>
							<Textarea id="description" rows={5} value={formData.description} onChange={handleChange} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="podcast_type">Podcast Type</Label>
							<Select value={formData.podcast_type} onValueChange={(v) => handleSelectChange("podcast_type", v)}>
								<SelectTrigger>
									<SelectValue placeholder="Select type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="episodic">Episodic</SelectItem>
									<SelectItem value="serial">Serial</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="language">Language</Label>
							<Select value={formData.language} onValueChange={(v) => handleSelectChange("language", v)}>
								<SelectTrigger>
									<SelectValue placeholder="Select language" />
								</SelectTrigger>
								<SelectContent className="max-h-64 overflow-y-auto">
									{LANG_OPTIONS.map((lang) => (
										<SelectItem key={lang.code} value={lang.code}>
											{lang.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="owner_name">Owner Name</Label>
							<Input id="owner_name" value={formData.owner_name} onChange={handleChange} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="author_name">Author Name</Label>
							<Input id="author_name" value={formData.author_name} onChange={handleChange} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="copyright_line">Copyright Line</Label>
							<Input id="copyright_line" value={formData.copyright_line} onChange={handleChange} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="contact_email">Contact Email</Label>
							<Input id="contact_email" type="email" value={formData.contact_email} onChange={handleChange} />
						</div>
						<div className="space-y-1">
							<Label>Cover</Label>
							<div className="flex items-start gap-4">
								{coverPreview && (
									<img
										src={coverPreview}
										alt="cover preview"
										className="w-16 h-16 rounded object-cover border"
									/>
								)}
								<div className="flex-1 space-y-2">
									<Input type="file" accept="image/*" onChange={handleCoverFileChange} />
									{!newCoverFile && (
										<p className="text-xs text-muted-foreground">
											Leave blank to keep existing cover.
										</p>
									)}
								</div>
							</div>
						</div>
						<div className="space-y-1">
							<Label>Categories</Label>
							<div className="space-y-1">
								{["category_id", "category_2_id", "category_3_id"].map((field, idx) => {
									const valueProp = formData[field] === "" ? undefined : String(formData[field]);
									return (
										<Select
											key={field}
											value={valueProp}
											onValueChange={(v) => {
												if (v === "__none__") {
													handleSelectChange(field, "");
												} else {
													handleSelectChange(field, v);
												}
											}}
										>
											<SelectTrigger>
												<SelectValue placeholder={idx === 0 ? "Primary category" : "Optional"} />
											</SelectTrigger>
											<SelectContent className="max-h-60 overflow-y-auto">
												{idx > 0 && <SelectItem value="__none__">(none)</SelectItem>}
												{categories.map((cat) => (
													<SelectItem key={cat.category_id} value={String(cat.category_id)}>
														{cat.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									);
								})}
								<p className="text-[10px] text-muted-foreground">
									Primary + up to two optional categories.
								</p>
							</div>
						</div>
						{(podcast?.rss_url_locked || podcast?.rss_url) && (
							<div className="space-y-1">
								<Label>RSS Feed</Label>
								<Input value={podcast.rss_url_locked || podcast.rss_url} readOnly className="text-xs" />
							</div>
						)}
						{podcast?.rss_url_locked && (
							<div className="space-y-1">
								<Label>RSS (Locked)</Label>
								<Input value={podcast.rss_url_locked} readOnly className="text-xs" />
							</div>
						)}
					</div>

					{originalSpreakerId && formData.spreaker_show_id !== originalSpreakerId && (
						<div className="col-span-4 -mt-2 mb-2 p-3 border border-amber-300 bg-amber-50 rounded text-xs space-y-2">
							<p className="font-semibold text-amber-800">
								Changing the Spreaker Show ID can break existing episode links.
							</p>
							<label className="flex items-start gap-2 text-amber-900">
								<input
									type="checkbox"
									checked={confirmShowIdChange}
									onChange={(e) => setConfirmShowIdChange(e.target.checked)}
								/>
								<span>
									I understand the risk and want to proceed with changing the Show ID.
								</span>
							</label>
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={isSaving}>
							{isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : ""}
							Save changes
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

