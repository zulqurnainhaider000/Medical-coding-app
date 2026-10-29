import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  analyzeScenario,
  checkServerHealth,
  searchDatabase,
  AnalyzedCodeItem,
  ApiNetworkError,
  ScenarioAnalysisResponse,
  SearchItem,
  API_BASE_URL,
} from '../services/BillingApi';

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'scenario'>('search');

  // --- Keyword Search State ---
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'icd' | 'cpt' | 'hcpcs'>('icd');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // --- Scenario Analysis State ---
  const [narrative, setNarrative] = useState('');
  const [analysisResult, setAnalysisResult] = useState<ScenarioAnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // --- Server Connection Diagnostics State ---
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  // Diagnostic ping helper to verify network access
  const handleTestConnection = async () => {
    setIsCheckingConnection(true);
    const reachable = await checkServerHealth();
    setIsCheckingConnection(false);

    if (reachable) {
      Alert.alert(
        'Backend Connected!',
        `Successfully reached Flask server at:\n${API_BASE_URL}\n\nBoth devices are communicating over Wi-Fi.`
      );
    } else {
      Alert.alert(
        'Connection Failed',
        `Could not reach ${API_BASE_URL}.\n\nCommon Causes:\n` +
          '1. Windows Firewall blocking port 5001\n' +
          '2. Flask server not bound to host="0.0.0.0"\n' +
          '3. Mobile phone and laptop on different Wi-Fi networks\n' +
          '4. Wi-Fi Router has AP/Client Isolation enabled'
      );
    }
  };

  // 1. Keyword Search Handler
  const handleSearchDatabase = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      Alert.alert('Search Required', 'Please enter a diagnosis, keyword, or code to search.');
      return;
    }

    setSearchLoading(true);
    setHasSearched(true);
    try {
      const data = await searchDatabase(trimmed, type);
      setResults(data);
    } catch (error: any) {
      const isNetError = error instanceof ApiNetworkError;
      const details = error?.details ? `\n\nDetails: ${error.details}` : '';
      Alert.alert(
        isNetError ? 'Network Connection Error' : 'Search Error',
        `${error.message}${details}`
      );
    } finally {
      setSearchLoading(false);
    }
  };

  // 2. AI Scenario Analysis Handler
  const handleAnalyzeScenario = async () => {
    const trimmed = narrative.trim();
    if (!trimmed) {
      Alert.alert('Narrative Required', 'Please enter or paste a medical scenario first.');
      return;
    }

    setAnalysisLoading(true);
    setAnalysisResult(null);

    try {
      const result = await analyzeScenario(trimmed);
      setAnalysisResult(result);
    } catch (error: any) {
      const isNetError = error instanceof ApiNetworkError;
      const details = error?.details ? `\n\nServer: ${error.details}` : '';
      Alert.alert(
        isNetError ? 'Network Error' : 'Scenario Analysis Failed',
        `${error.message}${details}`
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Helper component to render code sections safely without undefined mapping errors
  const renderCodeSection = (
    title: string,
    subtitle: string,
    badgeColor: string,
    codes: AnalyzedCodeItem[] | undefined
  ) => {
    const safeCodes = Array.isArray(codes) ? codes : [];

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>

        {safeCodes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No codes identified for this category.</Text>
          </View>
        ) : (
          safeCodes.map((item, index) => (
            <View key={`${item.code}-${index}`} style={styles.analysisCard}>
              <View style={[styles.codeBadge, { backgroundColor: badgeColor }]}>
                <Text style={styles.codeBadgeText}>{item.code || 'N/A'}</Text>
              </View>
              <View style={styles.analysisContent}>
                <Text style={styles.justificationText}>{item.justification || 'No justification provided'}</Text>
                {item.notes ? <Text style={styles.notesText}>Note: {item.notes}</Text> : null}
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Top Header */}
        <View style={styles.headerRow}>
          <Text style={styles.header}>Medical Billing & Coding</Text>
          <TouchableOpacity
            style={styles.healthButton}
            onPress={handleTestConnection}
            disabled={isCheckingConnection}>
            {isCheckingConnection ? (
              <ActivityIndicator size="small" color="#0284c7" />
            ) : (
              <Text style={styles.healthButtonText}>Test Connection</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.serverInfoText}>Backend: {API_BASE_URL}</Text>

        {/* Top Tab Navigator: Search vs Scenario */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'search' && styles.activeTabButton]}
            onPress={() => setActiveTab('search')}>
            <Text style={[styles.tabButtonText, activeTab === 'search' && styles.activeTabButtonText]}>
              Keyword Search
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'scenario' && styles.activeTabButton]}
            onPress={() => setActiveTab('scenario')}>
            <Text style={[styles.tabButtonText, activeTab === 'scenario' && styles.activeTabButtonText]}>
              AI Scenario Analysis
            </Text>
          </TouchableOpacity>
        </View>

        {/* -------------------- MODE 1: KEYWORD SEARCH -------------------- */}
        {activeTab === 'search' && (
          <View>
            <TextInput
              style={styles.input}
              placeholder="Search diagnosis or procedure (e.g. typhoid, wound, chest pain)"
              placeholderTextColor="#94a3b8"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={handleSearchDatabase}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.typeButton, type === 'icd' && styles.activeButton]}
                onPress={() => setType('icd')}>
                <Text style={[styles.buttonText, type === 'icd' && styles.activeButtonText]}>
                  ICD-10
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, type === 'cpt' && styles.activeButton]}
                onPress={() => setType('cpt')}>
                <Text style={[styles.buttonText, type === 'cpt' && styles.activeButtonText]}>
                  CPT Codes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, type === 'hcpcs' && styles.activeButton]}
                onPress={() => setType('hcpcs')}>
                <Text style={[styles.buttonText, type === 'hcpcs' && styles.activeButtonText]}>
                  HCPCS / Mod
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.searchButton, searchLoading && styles.disabledButton]}
              disabled={searchLoading}
              onPress={handleSearchDatabase}>
              {searchLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.searchButtonText}>Search Database</Text>
              )}
            </TouchableOpacity>

            {hasSearched && !searchLoading && results.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No matching codes found for &quot;{query}&quot;.</Text>
              </View>
            )}

            <FlatList
              scrollEnabled={false}
              data={results}
              keyExtractor={(item, index) => `${item.code}-${index}`}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.codeText}>{item.code}</Text>
                  <Text style={styles.descText}>{item.description}</Text>
                </View>
              )}
            />
          </View>
        )}

        {/* ----------------- MODE 2: SCENARIO ANALYSIS ------------------ */}
        {activeTab === 'scenario' && (
          <View>
            <Text style={styles.narrativeLabel}>Clinical Narrative / Doctor&apos;s Notes:</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Paste or type patient scenario (e.g. 45yo male presents with acute onset chest pain radiating to left arm. EKG performed, cardiac enzymes drawn...)"
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              value={narrative}
              onChangeText={setNarrative}
            />

            <View style={styles.scenarioActionRow}>
              <TouchableOpacity
                style={[styles.aiButton, analysisLoading && styles.disabledButton]}
                disabled={analysisLoading}
                onPress={handleAnalyzeScenario}>
                <Text style={styles.aiButtonText}>
                  {analysisLoading ? 'Analyzing Clinical Narrative...' : 'Analyze with AI Coder'}
                </Text>
              </TouchableOpacity>

              {narrative.length > 0 && !analysisLoading && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => {
                    setNarrative('');
                    setAnalysisResult(null);
                  }}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {analysisLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={styles.loadingText}>Extracting ICD-10, CPT, HCPCS & Modifiers...</Text>
                <Text style={styles.loadingSubtext}>Querying Gemini AI over local network...</Text>
              </View>
            )}

            {/* Render Category Cards upon completion */}
            {analysisResult && !analysisLoading && (
              <View style={styles.resultsContainer}>
                {renderCodeSection(
                  'ICD-10-CM Codes',
                  'Diagnosis & Medical Necessity',
                  '#0284c7',
                  analysisResult.icd_codes
                )}

                {renderCodeSection(
                  'CPT Codes',
                  'Procedures & Services',
                  '#16a34a',
                  analysisResult.cpt_codes
                )}

                {renderCodeSection(
                  'HCPCS Level II Codes',
                  'Supplies, Drugs & DME',
                  '#ea580c',
                  analysisResult.hcpcs_codes
                )}

                {renderCodeSection(
                  'Applicable Modifiers',
                  'Billing Clarifications & Disambiguation',
                  '#7c3aed',
                  analysisResult.modifiers
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: { flex: 1, backgroundColor: '#f8fafc' },
  container: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  header: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  healthButton: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthButtonText: {
    color: '#0284c7',
    fontSize: 12,
    fontWeight: '700',
  },
  serverInfoText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // Top Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTabButton: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },

  // Keyword Search Styles
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 15,
    fontSize: 15,
    color: '#0f172a',
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  typeButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
  },
  activeButton: { backgroundColor: '#0284c7' },
  buttonText: { fontWeight: '600', color: '#0284c7' },
  activeButtonText: { color: '#ffffff', fontWeight: '700' },
  searchButton: {
    backgroundColor: '#16a34a',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    minHeight: 48,
    justifyContent: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  codeText: { fontSize: 17, fontWeight: 'bold', color: '#0284c7' },
  descText: { fontSize: 14, color: '#334155', marginTop: 4 },

  // AI Scenario Analysis Styles
  narrativeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    fontSize: 15,
    minHeight: 130,
    lineHeight: 22,
    color: '#0f172a',
    marginBottom: 12,
  },
  scenarioActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  aiButton: {
    flex: 1,
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  disabledButton: {
    backgroundColor: '#a5b4fc',
  },
  aiButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: '#475569',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '600',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: '#94a3b8',
  },

  // Results Styles
  resultsContainer: {
    marginTop: 8,
  },
  sectionContainer: {
    marginBottom: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeaderRow: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  emptyCard: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  analysisCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  codeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
    marginTop: 2,
  },
  codeBadgeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  analysisContent: {
    flex: 1,
  },
  justificationText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500',
    lineHeight: 18,
  },
  notesText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
