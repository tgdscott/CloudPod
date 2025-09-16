import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { makeApi } from '@/lib/apiClient';

export default function DevTools({ token }) {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleResetDatabase = async () => {
        if (!window.confirm("ARE YOU SURE? This will permanently delete all data, including users, shows, and templates.")) {
            return;
        }

        setIsLoading(true);
        try {
            const result = await makeApi(token).post('/api/dev/reset-database');
            if (result && result.status && result.status >= 400) throw new Error(result.detail || 'Failed to reset database.');
            
            toast({
                title: "Database Reset!",
                description: "The database has been wiped and recreated. Please log out and sign up again.",
            });

        } catch (err) {
            toast({ title: "Reset Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6">
            <Card className="max-w-xl mx-auto border-red-500">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle /> Developer Tools
                    </CardTitle>
                    <CardDescription>
                        Use these tools to manage the development state of your application.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm font-medium">Reset Database</p>
                    <p className="text-sm text-muted-foreground">
                        This will completely wipe all data and recreate the database tables from the current code models.
                        This is useful after making changes to `podcast.py` or other models.
                    </p>
                    <Button variant="destructive" onClick={handleResetDatabase} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Force Reset Database"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}